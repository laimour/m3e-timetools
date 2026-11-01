import { describe, expect, it } from 'vitest'
import {
  arcPath,
  fractionFromPoint,
  fractionToAngle,
  pointOnCircle,
  timeRangeToFractions,
} from '../shared/utils/arc'
import { splitByDay, startOfDay } from '../shared/utils/time'
import { makeRecord } from './fixtures'

const CX = 320
const CY = 320
const R_OUTER = 266
const R_INNER = 212

function local(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime()
}

describe('极坐标换算', () => {
  it('0:00 在正上方，顺时针推进', () => {
    expect(fractionToAngle(0)).toBe(-90)
    expect(fractionToAngle(0.25)).toBe(0)
    expect(fractionToAngle(0.5)).toBe(90)
    expect(pointOnCircle(CX, CY, 100, 0)).toEqual({ x: CX, y: CY - 100 })
    expect(pointOnCircle(CX, CY, 100, 0.25).x).toBeCloseTo(CX + 100, 6)
  })

  it('由坐标反推占比', () => {
    expect(fractionFromPoint(CX, CY, CX, CY - 100)).toBeCloseTo(0, 6)
    expect(fractionFromPoint(CX, CY, CX + 100, CY)).toBeCloseTo(0.25, 6)
    expect(fractionFromPoint(CX, CY, CX, CY + 100)).toBeCloseTo(0.5, 6)
    expect(fractionFromPoint(CX, CY, CX - 100, CY)).toBeCloseTo(0.75, 6)
  })
})

describe('arcPath 环形扇区', () => {
  it('完整 24 小时使用闭合满环，不产生缺口', () => {
    const path = arcPath(CX, CY, R_OUTER, R_INNER, 0, 1)
    expect(path.startsWith(`M ${CX + R_OUTER} ${CY}`)).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    // 满环由两段外弧 + 两段内弧组成，不应出现单段缺口内缩
    expect(path.match(/A /g)).toHaveLength(4)
  })

  it('普通片段两端内缩 gapDeg 的一半', () => {
    const f0 = 9 / 24
    const f1 = 11.5 / 24
    const path = arcPath(CX, CY, R_OUTER, R_INNER, f0, f1, 2.4)
    expect(path).not.toBe('')
    expect(path).toMatch(/^M /)
    const start = pointOnCircle(CX, CY, R_OUTER, f0 + 2.4 / 720)
    expect(path).toContain(`M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`)
  })

  it('极短片段自适应缩小间隙但仍然可见', () => {
    const span = 0.0005
    const path = arcPath(CX, CY, R_OUTER, R_INNER, 0.5, 0.5 + span)
    expect(path).not.toBe('')
    expect(path.endsWith('Z')).toBe(true)
  })

  it('零长度片段不输出路径', () => {
    expect(arcPath(CX, CY, R_OUTER, R_INNER, 0.3, 0.3)).toBe('')
    expect(arcPath(CX, CY, R_OUTER, R_INNER, 1, 1)).toBe('')
  })

  it('参数顺序颠倒时也能得到同一路径', () => {
    const forward = arcPath(CX, CY, R_OUTER, R_INNER, 0.1, 0.4)
    const reversed = arcPath(CX, CY, R_OUTER, R_INNER, 0.4, 0.1)
    expect(reversed).toBe(forward)
  })
})

describe('当天占比映射', () => {
  it('09:00–11:30 映射到 0.375–0.479', () => {
    const dayStart = startOfDay(local(2026, 11, 1, 12, 0))
    const { f0, f1 } = timeRangeToFractions(
      local(2026, 11, 1, 9, 0),
      local(2026, 11, 1, 11, 30),
      dayStart,
      dayStart + 24 * 3600_000,
    )
    expect(f0).toBeCloseTo(0.375, 6)
    expect(f1).toBeCloseTo(0.4791666, 5)
  })

  it('跨零点记录按天切分后两天的占比落在盘面两端', () => {
    const start = local(2026, 11, 1, 23, 40)
    const end = local(2026, 11, 2, 0, 20)
    const slices = splitByDay(makeRecord([{ start, end }]), end)
    expect(slices).toHaveLength(2)
    const first = timeRangeToFractions(slices[0]!.start, slices[0]!.end!, slices[0]!.dayStart, startOfDay(end))
    const second = timeRangeToFractions(slices[1]!.start, slices[1]!.end!, slices[1]!.dayStart, startOfDay(end) + 24 * 3600_000)
    expect(first.f0).toBeCloseTo(23.6667 / 24, 4)
    expect(first.f1).toBeCloseTo(1, 6)
    expect(second.f0).toBeCloseTo(0, 6)
    expect(second.f1).toBeCloseTo(20 / 60 / 24, 6)
  })
})
