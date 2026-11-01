/**
 * 纯时间函数：所有时间计算都使用浏览器本地时区，不写死任何时区偏移。
 * 浏览器与服务端共用，禁止在此引入 Vue / Nuxt 依赖。
 */
import type { DaySlice, Segment, TimeRecord } from '../types'

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

/** 当天 00:00:00.000 的时间戳（本地时区） */
export function startOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 次日 00:00:00.000 的排他上界（处理夏令时，不直接用 +24h） */
export function endOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

/** 本地日期键 YYYY-MM-DD */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 由 YYYY-MM-DD 得到当天本地 00:00 时间戳 */
export function parseDayKey(key: string): number {
  const parts = key.split('-').map(Number)
  const y = parts[0] ?? 0
  const m = parts[1] ?? 1
  const d = parts[2] ?? 1
  return new Date(y, m - 1, d).getTime()
}

/** 本地 HH:mm */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 本地 HH:mm:ss */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 本地 YYYY-MM-DD HH:mm:ss（导出 CSV 用） */
export function formatDateTime(ts: number): string {
  return `${dayKey(ts)} ${formatClock(ts)}`
}

/** datetime-local 输入框需要的本地格式 YYYY-MM-DDTHH:mm */
export function toDateTimeLocal(ts: number): string {
  return `${dayKey(ts)}T${formatTime(ts)}`
}

/** 解析 datetime-local / 日期 + 时间输入，返回本地时间戳；非法返回 null */
export function parseLocalDateTime(value: string): number | null {
  if (!value) return null
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  const ts = new Date(y, mo - 1, d, h, mi, 0, 0).getTime()
  return Number.isNaN(ts) ? null : ts
}

/** 本地日期 + 时刻（HH:mm）→ 时间戳 */
export function parseDateAndTime(date: string, time: string): number | null {
  return parseLocalDateTime(`${date}T${time}`)
}

/** 当天已过的毫秒数（按本地时间取值） */
export function msSinceMidnight(ts: number): number {
  return ts - startOfDay(ts)
}

/** 当天从 00:00 到 24:00 的总毫秒数（兼容夏令时） */
export function dayLength(ts: number): number {
  return endOfDay(ts) - startOfDay(ts)
}

/** 某时刻在当天 00:00–24:00 的占比（0–1），按本地时区映射 */
export function fractionOfDay(ts: number, dayStart = startOfDay(ts)): number {
  const length = endOfDay(dayStart) - dayStart
  if (length <= 0) return 0
  return Math.min(1, Math.max(0, (ts - dayStart) / length))
}

/** 归一化分段：开放段用 now 收口，同时过滤无效/负时长段 */
export function normalizeSegments(segments: Segment[], now: number): { start: number; end: number }[] {
  if (!segments?.length) return []
  const out: { start: number; end: number }[] = []
  for (const seg of segments) {
    const end = seg.end ?? now
    if (!Number.isFinite(seg.start) || !Number.isFinite(end)) continue
    if (end <= seg.start) continue
    out.push({ start: seg.start, end })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** 净时长：所有分段之和（开放段用 now），不含暂停间隙 */
export function netMs(record: TimeRecord, now: number): number {
  return normalizeSegments(record.segments, now).reduce((sum, s) => sum + (s.end - s.start), 0)
}

/** 首尾跨度：首段开始 → 末段结束（或 now），含暂停间隙 */
export function spanMs(record: TimeRecord, now: number): number {
  const segs = normalizeSegments(record.segments, now)
  if (!segs.length) return 0
  const start = segs[0]!.start
  const end = segs.reduce((max, s) => Math.max(max, s.end), start)
  return Math.max(0, end - start)
}

/** 暂停累计时长 = 跨度 - 净时长 */
export function pausedMs(record: TimeRecord, now: number): number {
  return Math.max(0, spanMs(record, now) - netMs(record, now))
}

/** 首段开始时间；无分段返回 null */
export function firstStart(record: TimeRecord): number | null {
  if (!record.segments?.length) return null
  return record.segments.reduce((min, s) => Math.min(min, s.start), Number.MAX_SAFE_INTEGER)
}

/** 末段结束时间（开放段用 now） */
export function lastEnd(record: TimeRecord, now: number): number | null {
  if (!record.segments?.length) return null
  return record.segments.reduce((max, s) => Math.max(max, s.end ?? now), 0)
}

/** 倒计时推定结束点 = 首段开始 + 设定时长；正计时返回 null */
export function countdownEnd(record: TimeRecord): number | null {
  if (record.mode !== 'countdown' || !record.targetMs) return null
  const start = firstStart(record)
  if (start === null) return null
  return start + record.targetMs
}

/** 是否处于活动计时（运行或暂停） */
export function isActive(record: TimeRecord): boolean {
  return record.status === 'running' || record.status === 'paused'
}

/**
 * 按本地日期切分一条记录的净片段。
 * 跨零点的分段会切成两段，两天之和既不重复也不遗漏。
 */
export function splitByDay(record: TimeRecord, now: number): DaySlice[] {
  const segs = normalizeSegments(record.segments, now)
  if (!segs.length) return []

  const grouped = new Map<string, { dayStart: number; slices: { start: number; end: number }[] }>()

  for (const seg of segs) {
    let cursor = seg.start
    // 防御：异常数据导致的死循环
    for (let guard = 0; guard < 64 && cursor < seg.end; guard++) {
      const key = dayKey(cursor)
      const dayStart = startOfDay(cursor)
      const dayEnd = endOfDay(cursor)
      const pieceEnd = Math.min(seg.end, dayEnd)
      const bucket = grouped.get(key) ?? { dayStart, slices: [] }
      bucket.slices.push({ start: cursor, end: pieceEnd })
      grouped.set(key, bucket)
      cursor = pieceEnd
    }
  }

  return [...grouped.entries()]
    .map(([key, bucket]) => {
      const slices = bucket.slices.sort((a, b) => a.start - b.start)
      const start = slices[0]!.start
      const end = slices.reduce((max, s) => Math.max(max, s.end), start)
      return {
        dayKey: key,
        dayStart: bucket.dayStart,
        start,
        end,
        segments: slices.map((s) => ({ start: s.start, end: s.end })),
      }
    })
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
}

/** 日期键加减天数 */
export function addDays(key: string, delta: number): string {
  const ts = parseDayKey(key)
  const d = new Date(ts)
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta).getTime())
}

/** 周范围：周一 00:00 → 下周一 00:00（排他） */
export function weekRange(ts: number): { start: number; end: number } {
  const dayStart = startOfDay(ts)
  const dow = new Date(dayStart).getDay() // 0=周日
  const offset = (dow + 6) % 7 // 周一为 0
  const monday = new Date(dayStart)
  monday.setDate(monday.getDate() - offset)
  const start = monday.getTime()
  const next = new Date(monday)
  next.setDate(next.getDate() + 7)
  return { start, end: next.getTime() }
}

/** 月范围：当月 1 日 00:00 → 次月 1 日 00:00（排他） */
export function monthRange(ts: number): { start: number; end: number } {
  const d = new Date(ts)
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
  return { start, end }
}

/** 当月所有日期键，按自然顺序 */
export function monthDayKeys(ts: number): string[] {
  const d = new Date(ts)
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const out: string[] = []
  for (let i = 1; i <= days; i++) {
    out.push(dayKey(new Date(d.getFullYear(), d.getMonth(), i).getTime()))
  }
  return out
}

/**
 * 显示用时长：0 → 0 分钟；<1 分钟 → 秒；<1 小时 → 分钟；否则小时+分。
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 分钟'
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return `${totalSec} 秒`
  const totalMin = Math.floor(ms / MINUTE_MS)
  if (totalMin < 60) return `${totalMin} 分钟`
  const hours = Math.floor(ms / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)
  return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
}

/** 大数字 + 小单位拆分（统计卡使用） */
export function formatDurationParts(ms: number): { main: string; unit: string } {
  if (!Number.isFinite(ms) || ms <= 0) return { main: '0', unit: '分钟' }
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return { main: String(totalSec), unit: '秒' }
  const totalMin = Math.floor(ms / MINUTE_MS)
  if (totalMin < 60) return { main: String(totalMin), unit: '分钟' }
  const hours = Math.floor(ms / HOUR_MS)
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS)
  return { main: String(hours), unit: minutes > 0 ? `小时 ${minutes} 分` : '小时' }
}

/** 计时器显示：HH:MM:SS（超过 24 小时则显示 小时:分:秒） */
export function formatTimer(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h >= 100) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/**
 * 改写分段时间：可移动整体起点（保留暂停间隙），也可指定末段结束点。
 * 返回新分段数组，不修改入参。
 */
export function retimeSegments(
  segments: Segment[],
  newStart?: number | null,
  newEnd?: number | null,
): Segment[] {
  if (!segments.length) return []
  const first = segments[0]!.start
  const delta = newStart != null ? newStart - first : 0
  let next = segments.map((s) => ({
    start: s.start + delta,
    end: s.end === null ? null : s.end + delta,
  }))
  if (newEnd != null && next.length) {
    const last = next[next.length - 1]!
    if (newEnd > last.start) {
      last.end = newEnd
    }
  }
  return next
}
