import { describe, expect, it } from 'vitest'
import {
  FRAGMENT_THRESHOLD_MS,
  dayStats,
  dailyNetMap,
  fragmentationInRange,
  heatLevel,
  hourlyBuckets,
  monthGrid,
  peak,
  summarizeRange,
  weekKeys,
} from '../shared/utils/stats'
import { dayKey, monthRange, startOfDay, weekRange } from '../shared/utils/time'
import { HOUR, MINUTE, makeRecord } from './fixtures'

function local(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

const NOON = local(2026, 11, 1, 12, 0)

describe('碎片率口径', () => {
  it('单段净时长小于 5 分钟算碎片，恰好 5 分钟不算', () => {
    const dayStart = startOfDay(NOON)
    const records = [
      makeRecord([{ start: dayStart + 9 * HOUR, end: dayStart + 9 * HOUR + 4 * MINUTE }]),
      makeRecord([{ start: dayStart + 10 * HOUR, end: dayStart + 10 * HOUR + 5 * MINUTE }]),
      makeRecord([{ start: dayStart + 11 * HOUR, end: dayStart + 11 * HOUR + 6 * MINUTE }]),
    ]
    const result = fragmentationInRange(
      records,
      dayStart,
      startOfDay(local(2026, 11, 2)),
      local(2026, 11, 1, 15, 0),
    )
    expect(result.segmentCount).toBe(3)
    expect(result.fragmentCount).toBe(1)
    expect(result.fragmentMs).toBe(4 * MINUTE)
    expect(result.totalMs).toBe(15 * MINUTE)
    expect(result.countRatio).toBeCloseTo(1 / 3)
    expect(result.msRatio).toBeCloseTo(4 / 15)
    expect(FRAGMENT_THRESHOLD_MS).toBe(5 * MINUTE)
  })

  it('区间为空时返回零值而不是 NaN', () => {
    const empty = fragmentationInRange([], startOfDay(NOON), startOfDay(local(2026, 11, 2)), NOON)
    expect(empty.segmentCount).toBe(0)
    expect(empty.countRatio).toBe(0)
    expect(empty.msRatio).toBe(0)
  })
})

describe('heatLevel 热力档位', () => {
  it('0 为 0 档，最大值到 5 档，中间单调不减', () => {
    const max = 8 * HOUR
    expect(heatLevel(0, max)).toBe(0)
    expect(heatLevel(-1, max)).toBe(0)
    expect(heatLevel(max, max)).toBe(5)
    const samples = [0.05, 0.2, 0.4, 0.6, 0.9].map((r) => heatLevel(max * r, max))
    expect(samples).toEqual([...samples].sort((a, b) => a - b))
    for (const level of samples) expect(level).toBeGreaterThan(0)
    expect(heatLevel(max, 0)).toBe(0)
  })
})

describe('hourlyBuckets 今日 24 格', () => {
  it('按小时切分，跨小时片段按比例落到两格', () => {
    const dayStart = startOfDay(NOON)
    const buckets = hourlyBuckets(
      [makeRecord([{ start: dayStart + 9 * HOUR, end: dayStart + 11 * HOUR + 30 * MINUTE }])],
      NOON,
    )
    expect(buckets).toHaveLength(24)
    expect(buckets[9]).toBe(HOUR)
    expect(buckets[10]).toBe(HOUR)
    expect(buckets[11]).toBe(30 * MINUTE)
    expect(buckets[8]).toBe(0)
  })

  it('只统计今天，其它日期不计入', () => {
    const yesterday = local(2026, 10, 31, 9, 0)
    const buckets = hourlyBuckets([makeRecord([{ start: yesterday, end: yesterday + HOUR }])], NOON)
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('dayStats / summarizeRange', () => {
  it('逐日汇总跨天记录，有效时长不含暂停间隙', () => {
    const start = local(2026, 10, 31, 23, 0)
    const end = local(2026, 11, 1, 1, 0)
    const records = [makeRecord([{ start, end }])]
    const stats = dayStats(records, end)
    expect(stats.map((s) => s.dayKey)).toEqual(['2026-10-31', '2026-11-01'])
    expect(stats[0]!.netMs).toBe(HOUR)
    expect(stats[1]!.netMs).toBe(HOUR)
    expect(stats[1]!.spanMs).toBe(HOUR)
  })

  it('本周汇总口径为周一 00:00 起算', () => {
    const { start, end } = weekRange(NOON)
    const records = [
      makeRecord([{ start: local(2026, 10, 28, 9, 0), end: local(2026, 10, 28, 11, 0) }]),
      makeRecord([{ start: local(2026, 11, 1, 9, 0), end: local(2026, 11, 1, 10, 0) }]),
    ]
    const summary = summarizeRange(records, start, end, NOON)
    expect(summary.netMs).toBe(3 * HOUR)
    expect(summary.activeDays).toBe(2)
    expect(summary.recordCount).toBe(2)
    expect(summary.peakDayKey).toBe('2026-10-28')
    expect(summary.peakMs).toBe(2 * HOUR)
  })

  it('每日净时长映射与 weekKeys 长度正确', () => {
    const map = dailyNetMap(
      [makeRecord([{ start: local(2026, 11, 1, 9, 0), end: local(2026, 11, 1, 10, 0) }])],
      NOON,
    )
    expect(map.get('2026-11-01')).toBe(HOUR)
    expect(weekKeys(NOON)).toHaveLength(7)
    expect(weekKeys(NOON)[0]).toBe('2026-10-26')
  })
})

describe('peak', () => {
  it('取净时长最大的一天，空数据返回 null', () => {
    expect(peak([])).toEqual({ dayKey: null, ms: 0 })
    const stats = dayStats(
      [
        makeRecord([{ start: local(2026, 11, 1, 9, 0), end: local(2026, 11, 1, 12, 0) }]),
        makeRecord([{ start: local(2026, 10, 30, 9, 0), end: local(2026, 10, 30, 10, 0) }]),
      ],
      NOON,
    )
    expect(peak(stats)).toEqual({ dayKey: '2026-11-01', ms: 3 * HOUR })
  })
})

describe('monthGrid 月度网格', () => {
  it('每周 7 列，首列对齐周一', () => {
    const { start, end } = monthRange(NOON)
    const grid = monthGrid(NOON, new Map())
    expect(grid.length).toBeGreaterThanOrEqual(5)
    for (const row of grid) expect(row).toHaveLength(7)

    const flat = grid.flat()
    const firstDay = flat.filter((c) => c.dayKey !== null)[0]
    expect(firstDay?.dayKey).toBe('2026-11-01')
    // 2026-11-01 是周日，所在行前 6 格为空
    expect(grid[0]!.filter((c) => c.dayKey === null)).toHaveLength(6)
    expect(flat.filter((c) => c.dayKey !== null)).toHaveLength(30)
    expect(dayKey(start)).toBe('2026-11-01')
    expect(dayKey(end)).toBe('2026-12-01')
    expect(dayKey(local(2026, 11, 30))).toBe('2026-11-30')
  })

  it('传入净时长映射后格子带上毫秒值', () => {
    const grid = monthGrid(NOON, new Map([['2026-11-01', 2 * HOUR]]))
    const cell = grid.flat().find((c) => c.dayKey === '2026-11-01')
    expect(cell?.ms).toBe(2 * HOUR)
  })
})
