/**
 * 统计纯函数：有效/总时长、碎片率、热力档位、连续天数、峰值、月度网格。
 * 所有口径都在这里定义，模板与组件只消费结果。
 */
import type { Segment, TimeRecord } from '../types'
import {
  HOUR_MS,
  MINUTE_MS,
  addDays,
  dayKey,
  monthDayKeys,
  parseDayKey,
  splitByDay,
  startOfDay,
  weekRange,
} from './time'

export const FRAGMENT_THRESHOLD_MS = 5 * MINUTE_MS

export interface DayStat {
  dayKey: string
  /** 有效时长：净时长之和（不含暂停间隙） */
  netMs: number
  /** 总时长：首段开始 → 末段结束（含暂停间隙），按天裁剪 */
  spanMs: number
  recordCount: number
  segmentCount: number
}

export interface Fragmentation {
  segmentCount: number
  fragmentCount: number
  countRatio: number
  /** 碎片段的净时长合计 */
  fragmentMs: number
  totalMs: number
  msRatio: number
}

export interface PeriodSummary {
  netMs: number
  spanMs: number
  activeDays: number
  streak: number
  peakDayKey: string | null
  peakMs: number
  recordCount: number
  segmentCount: number
}

/** 逐日统计：每条记录按天切分后累加，跨天不重复不遗漏 */
export function dayStats(records: TimeRecord[], now: number): DayStat[] {
  const map = new Map<string, DayStat>()
  for (const record of records) {
    for (const slice of splitByDay(record, now)) {
      const net = slice.segments.reduce((sum, s) => sum + ((s.end ?? now) - s.start), 0)
      const span = Math.max(0, (slice.end ?? now) - slice.start)
      const item = map.get(slice.dayKey) ?? {
        dayKey: slice.dayKey,
        netMs: 0,
        spanMs: 0,
        recordCount: 0,
        segmentCount: 0,
      }
      item.netMs += net
      item.spanMs += span
      item.recordCount += 1
      item.segmentCount += slice.segments.length
      map.set(slice.dayKey, item)
    }
  }
  return [...map.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/** 每日净时长映射（热力图用） */
export function dailyNetMap(records: TimeRecord[], now: number): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of dayStats(records, now)) {
    map.set(item.dayKey, item.netMs)
  }
  return map
}

/** 指定时间范围内（按本地日）逐日统计 */
export function dayStatsInRange(
  records: TimeRecord[],
  start: number,
  end: number,
  now: number,
): DayStat[] {
  const startKey = dayKey(start)
  const endKey = dayKey(end)
  return dayStats(records, now).filter((d) => d.dayKey >= startKey && d.dayKey < endKey)
}

/** 统计连续天数：今天未记录时允许从昨天起算 */
export function streak(activeKeys: Iterable<string>, todayKey = dayKey(Date.now())): number {
  const set = new Set(activeKeys)
  let cursor = set.has(todayKey) ? todayKey : addDays(todayKey, -1)
  let count = 0
  while (set.has(cursor)) {
    count += 1
    cursor = addDays(cursor, -1)
  }
  return count
}

/** 峰值：区间内净时长最大的一天 */
export function peak(dayStatsList: DayStat[]): { dayKey: string | null; ms: number } {
  let best: DayStat | null = null
  for (const d of dayStatsList) {
    if (!best || d.netMs > best.netMs) best = d
  }
  return { dayKey: best?.dayKey ?? null, ms: best?.netMs ?? 0 }
}

/** 区间汇总（用于今日 / 本周 / 本月三张卡） */
export function summarizeRange(
  records: TimeRecord[],
  start: number,
  end: number,
  now: number,
): PeriodSummary {
  const days = dayStatsInRange(records, start, end, now)
  const allActiveKeys: string[] = []
  for (const item of dayStats(records, now)) {
    if (item.netMs > 0) allActiveKeys.push(item.dayKey)
  }
  const netMs = days.reduce((sum, d) => sum + d.netMs, 0)
  const spanMs = days.reduce((sum, d) => sum + d.spanMs, 0)
  const activeDays = days.filter((d) => d.netMs > 0).length
  const peakItem = peak(days)
  return {
    netMs,
    spanMs,
    activeDays,
    streak: streak(allActiveKeys, dayKey(now)),
    peakDayKey: peakItem.dayKey,
    peakMs: peakItem.ms,
    recordCount: days.reduce((sum, d) => sum + d.recordCount, 0),
    segmentCount: days.reduce((sum, d) => sum + d.segmentCount, 0),
  }
}

/** 碎片率：单段净时长 < 5 分钟视为碎片（恰好 5 分钟不算） */
export function fragmentationInRange(
  records: TimeRecord[],
  start: number,
  end: number,
  now: number,
): Fragmentation {
  const startKey = dayKey(start)
  const endKey = dayKey(end)
  let segmentCount = 0
  let fragmentCount = 0
  let totalMs = 0
  let fragmentMs = 0

  for (const record of records) {
    for (const slice of splitByDay(record, now)) {
      if (slice.dayKey < startKey || slice.dayKey >= endKey) continue
      for (const seg of slice.segments) {
        const duration = (seg.end ?? now) - seg.start
        if (duration <= 0) continue
        segmentCount += 1
        totalMs += duration
        if (duration < FRAGMENT_THRESHOLD_MS) {
          fragmentCount += 1
          fragmentMs += duration
        }
      }
    }
  }

  return {
    segmentCount,
    fragmentCount,
    countRatio: segmentCount ? fragmentCount / segmentCount : 0,
    fragmentMs,
    totalMs,
    msRatio: totalMs ? fragmentMs / totalMs : 0,
  }
}

/** 热力档位 0–5：0 时长为 0 档；最大值 → 5 档；中间单调 */
export function heatLevel(valueMs: number, maxMs: number): number {
  if (!Number.isFinite(valueMs) || valueMs <= 0) return 0
  if (!Number.isFinite(maxMs) || maxMs <= 0) return 0
  const ratio = Math.min(1, valueMs / maxMs)
  if (ratio >= 0.999) return 5
  if (ratio >= 0.75) return 5
  if (ratio >= 0.55) return 4
  if (ratio >= 0.35) return 3
  if (ratio >= 0.18) return 2
  return 1
}

/** 今日按小时分桶：24 格净时长 */
export function hourlyBuckets(records: TimeRecord[], now: number): number[] {
  const dayStart = startOfDay(now)
  const buckets = new Array(24).fill(0) as number[]
  for (const record of records) {
    for (const slice of splitByDay(record, now)) {
      if (dayKey(slice.start) !== dayKey(now)) continue
      for (const seg of slice.segments) {
        const end = seg.end ?? now
        let cursor = seg.start
        for (let guard = 0; guard < 48 && cursor < end; guard++) {
          const hourIndex = Math.floor((cursor - dayStart) / HOUR_MS)
          if (hourIndex < 0 || hourIndex > 23) break
          const hourEnd = dayStart + (hourIndex + 1) * HOUR_MS
          const pieceEnd = Math.min(end, hourEnd)
          buckets[hourIndex]! += pieceEnd - cursor
          cursor = pieceEnd
        }
      }
    }
  }
  return buckets
}

/** 本月按天网格：周一为行首，返回按周排列的单元 */
export function monthGrid(
  now: number,
  netMap: Map<string, number>,
): { dayKey: string | null; ms: number }[][] {
  const keys = monthDayKeys(now)
  if (!keys.length) return []
  const cells: { dayKey: string | null; ms: number }[] = []
  const firstDow = (new Date(parseDayKey(keys[0]!)).getDay() + 6) % 7 // 周一=0
  for (let i = 0; i < firstDow; i++) cells.push({ dayKey: null, ms: 0 })
  for (const key of keys) cells.push({ dayKey: key, ms: netMap.get(key) ?? 0 })
  while (cells.length % 7 !== 0) cells.push({ dayKey: null, ms: 0 })

  const weeks: { dayKey: string | null; ms: number }[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** 本周 7 个日期键（周一 → 周日） */
export function weekKeys(ts: number): string[] {
  const { start, end } = weekRange(ts)
  const keys: string[] = []
  let cursor = start
  while (cursor < end && keys.length < 7) {
    keys.push(dayKey(cursor))
    const d = new Date(cursor)
    cursor = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  }
  return keys
}

/** 百分比展示（保留整数） */
export function percent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%'
  const value = ratio * 100
  if (value < 1) return '<1%'
  return `${Math.round(value)}%`
}

/** 用于列表条形的相对比例：以最大值为 1 */
export function relativeValue(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(max) || max <= 0) return 0
  return Math.min(1, value / max)
}

/** 暂停区间：相邻分段之间的间隙 */
export function pauseGaps(segments: Segment[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  if (!segments?.length) return out
  for (let i = 1; i < segments.length; i++) {
    const prevEnd = segments[i - 1]!.end
    const nextStart = segments[i]!.start
    if (prevEnd !== null && nextStart > prevEnd) {
      out.push({ start: prevEnd, end: nextStart })
    }
  }
  return out
}