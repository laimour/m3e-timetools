import type { Segment, TimeRecord } from '../shared/types'

export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

/** 测试用记录工厂：默认已结束，末段开放时自动视为运行中 */
export function makeRecord(segments: Segment[], overrides: Partial<TimeRecord> = {}): TimeRecord {
  const last = segments[segments.length - 1]
  const start = segments[0]?.start ?? 0
  const fallbackStatus = last && last.end === null ? 'running' : 'ended'
  return {
    id: 'r1',
    name: '深度工作',
    colorIndex: 0,
    mode: 'countup',
    targetMs: null,
    note: '',
    interrupted: false,
    segments,
    status: fallbackStatus,
    createdAt: start,
    updatedAt: start,
    revisions: [],
    ...overrides,
  }
}