import { describe, expect, it } from 'vitest'
import {
  addDays,
  countdownEnd,
  dayKey,
  firstStart,
  formatDuration,
  netMs,
  pausedMs,
  splitByDay,
  spanMs,
  startOfDay,
  weekRange,
} from '../shared/utils/time'
import { streak } from '../shared/utils/stats'
import { HOUR, MINUTE, makeRecord } from './fixtures'

/** 本地时间构造（月份 1–12） */
function local(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

function sliceDuration(record: ReturnType<typeof makeRecord>, now: number): number {
  return splitByDay(record, now).reduce(
    (sum, slice) => sum + slice.segments.reduce((s, seg) => s + ((seg.end ?? now) - seg.start), 0),
    0,
  )
}

describe('splitByDay 跨零点切分', () => {
  it('23:40–00:20 切成两天，总和既不重复也不遗漏', () => {
    const start = local(2026, 11, 1, 23, 40)
    const end = local(2026, 11, 2, 0, 20)
    const record = makeRecord([{ start, end }])
    const slices = splitByDay(record, end)

    expect(slices.map((s) => s.dayKey)).toEqual(['2026-11-01', '2026-11-02'])
    expect(sliceDuration(record, end)).toBe(40 * MINUTE)
    expect(slices[0]!.segments[0]!.end).toBe(local(2026, 11, 2, 0, 0))
    expect(slices[1]!.segments[0]!.start).toBe(local(2026, 11, 2, 0, 0))
  })

  it('正好结束在零点时只算前一天，不产生空片段', () => {
    const start = local(2026, 11, 1, 23, 30)
    const end = local(2026, 11, 2, 0, 0)
    const record = makeRecord([{ start, end }])
    const slices = splitByDay(record, end)
    expect(slices).toHaveLength(1)
    expect(slices[0]!.dayKey).toBe('2026-11-01')
    expect(sliceDuration(record, end)).toBe(30 * MINUTE)
  })

  it('全年最后一天跨到次年仍然两天各一段', () => {
    const start = local(2026, 12, 31, 23, 0)
    const end = local(2027, 1, 1, 1, 0)
    const record = makeRecord([{ start, end }])
    const slices = splitByDay(record, end)
    expect(slices.map((s) => s.dayKey)).toEqual(['2026-12-31', '2027-01-01'])
    expect(sliceDuration(record, end)).toBe(2 * HOUR)
  })

  it('多段记录跨天时按段裁剪，暂停间隙不丢失也不重复', () => {
    const a = local(2026, 11, 1, 23, 10)
    const b = local(2026, 11, 2, 0, 10)
    const c = local(2026, 11, 2, 0, 30)
    const d = local(2026, 11, 2, 1, 0)
    const record = makeRecord([
      { start: a, end: b },
      { start: c, end: d },
    ])
    const slices = splitByDay(record, d)
    expect(slices).toHaveLength(2)
    const first = slices[0]!.segments.reduce((sum, s) => sum + ((s.end ?? d) - s.start), 0)
    const second = slices[1]!.segments.reduce((sum, s) => sum + ((s.end ?? d) - s.start), 0)
    expect(first).toBe(50 * MINUTE)
    expect(second).toBe(40 * MINUTE)
  })
})

describe('netMs / spanMs', () => {
  it('暂停区间只进 span 不进 net', () => {
    const a = local(2026, 11, 1, 9, 0)
    const b = local(2026, 11, 1, 9, 25)
    const c = local(2026, 11, 1, 9, 45)
    const d = local(2026, 11, 1, 10, 0)
    const record = makeRecord([
      { start: a, end: b },
      { start: c, end: d },
    ])
    expect(netMs(record, d)).toBe(40 * MINUTE)
    expect(spanMs(record, d)).toBe(HOUR)
    expect(pausedMs(record, d)).toBe(20 * MINUTE)
  })

  it('开放段使用传入的 now，不受 tick 影响', () => {
    const start = local(2026, 11, 1, 9, 0)
    const record = makeRecord([{ start, end: null }], { status: 'running' })
    expect(netMs(record, start + 30 * MINUTE)).toBe(30 * MINUTE)
    expect(netMs(record, start + 90 * MINUTE)).toBe(90 * MINUTE)
  })

  it('空分段返回 0', () => {
    const record = makeRecord([])
    expect(netMs(record, Date.now())).toBe(0)
    expect(spanMs(record, Date.now())).toBe(0)
  })
})

describe('countdownEnd', () => {
  it('只由首段开始时间与设定时长决定，与 tick 无关', () => {
    const start = local(2026, 11, 1, 9, 0)
    const record = makeRecord([{ start, end: null }], {
      mode: 'countdown',
      targetMs: 25 * MINUTE,
      status: 'running',
    })
    const end = countdownEnd(record)
    expect(end).toBe(start + 25 * MINUTE)
    // 休眠恢复后同一记录仍得到相同结束点
    expect(countdownEnd(makeRecord([{ start, end: null }], { mode: 'countdown', targetMs: 25 * MINUTE }))).toBe(end)
    expect(firstStart(record)).toBe(start)
  })
})

describe('formatDuration 中文显示', () => {
  it('0 / 59 秒 / 1 小时 / 24 小时', () => {
    expect(formatDuration(0)).toBe('0 分钟')
    expect(formatDuration(59 * 1000)).toBe('59 秒')
    expect(formatDuration(HOUR)).toBe('1 小时')
    expect(formatDuration(24 * HOUR)).toBe('24 小时')
  })
})

describe('weekRange / streak', () => {
  it('周一为起点', () => {
    const sunday = local(2026, 11, 1, 12, 0)
    const { start, end } = weekRange(sunday)
    expect(dayKey(start)).toBe('2026-10-26')
    expect(new Date(start).getDay()).toBe(1)
    expect(end - start).toBe(7 * HOUR * 24)
  })

  it('连续天数允许今天未记录时从昨天起算', () => {
    const today = '2026-11-01'
    expect(streak([today, addDays(today, -1), addDays(today, -2)], today)).toBe(3)
    expect(streak([addDays(today, -1), addDays(today, -2)], today)).toBe(2)
    expect(streak([addDays(today, -2)], today)).toBe(0)
    expect(streak([], today)).toBe(0)
  })

  it('startOfDay 是本地零点', () => {
    expect(dayKey(startOfDay(local(2026, 11, 1, 23, 59)))).toBe('2026-11-01')
  })
})