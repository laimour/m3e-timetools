/**
 * 全局共享类型：记录、分段、修订、API DTO。
 * 浏览器与服务端都从这里读取，保证同一份契约。
 */

export type RecordMode = 'countup' | 'countdown'
export type RecordStatus = 'running' | 'paused' | 'ended'

/** 分段区间：epoch 毫秒；end 为 null 表示该段仍在运行 */
export interface Segment {
  start: number
  end: number | null
}

/** 修改痕迹：字段、改前、改后、修改时间 */
export interface Revision {
  at: number
  field: string
  before: unknown
  after: unknown
}

/** 一条计时记录 */
export interface TimeRecord {
  id: string
  name: string
  colorIndex: number
  mode: RecordMode
  /** 倒计时总时长；正计时为 null */
  targetMs: number | null
  note: string
  /** 用户手动标记「有中断」，只做分类，不剔除净时长 */
  interrupted: boolean
  segments: Segment[]
  status: RecordStatus
  createdAt: number
  updatedAt: number
  revisions: Revision[]
  /** 软删除时间；有值即视为已删除，仅导出时出现 */
  deletedAt?: number
}

/** 名称 → 颜色索引 的注册表（键为 trim + 小写归一后的名称） */
export type ColorRegistry = Record<string, number>

/** 服务端 JSON 文件结构 */
export interface StoreFile {
  schemaVersion: number
  colorRegistry: ColorRegistry
  records: TimeRecord[]
}

/** GET /api/data 返回 */
export interface DataResponse {
  schemaVersion: number
  records: TimeRecord[]
  colorRegistry: ColorRegistry
  active: TimeRecord | null
  /** 数据文件损坏等异常提示，正常时为 null */
  warning: string | null
}

/** POST /api/records 请求体 */
export interface CreateRecordPayload {
  name: string
  mode: RecordMode
  targetMs: number | null
  note?: string
  /** 运行中记录的首段开始时间（默认服务端当前时间） */
  startedAt?: number
  /** 手动补记：结束时间；有值时直接生成已结束记录 */
  endedAt?: number
}

/** PATCH /api/records/[id] 请求体：只传需要改的字段 */
export interface UpdateRecordPayload {
  name?: string
  note?: string
  mode?: RecordMode
  targetMs?: number | null
  interrupted?: boolean
  status?: RecordStatus
  segments?: Segment[]
}

/** 详情面板用于展示的切片（某一天内的片段） */
export interface DaySlice {
  /** 本地日期键 YYYY-MM-DD */
  dayKey: string
  dayStart: number
  start: number
  end: number | null
  segments: Segment[]
}