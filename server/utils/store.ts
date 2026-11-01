/**
 * 服务端 JSON 存储：原子写、串行写队列、损坏备份、schema 校验。
 * 禁止在记录上使用定时器累加，这里只负责持久化真实时间戳。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createError, type H3Event } from 'h3'
import { ensureColor, normalizeName } from '../../shared/utils/color'
import type {
  ColorRegistry,
  CreateRecordPayload,
  DataResponse,
  Segment,
  StoreFile,
  TimeRecord,
  UpdateRecordPayload,
} from '../../shared/types'
import { isActive, MINUTE_MS, DAY_MS } from '../../shared/utils/time'

export const SCHEMA_VERSION = 1
const MAX_COUNTDOWN_MS = DAY_MS

/** 文件损坏等提示，供 UI 读取一次 */
let lastWarning: string | null = null

function dataDir(): string {
  return process.env.M3E_DATA_DIR
    ? path.resolve(process.env.M3E_DATA_DIR)
    : path.resolve(process.cwd(), '.data')
}

function storePath(): string {
  return path.join(dataDir(), 'store.json')
}

function emptyStore(): StoreFile {
  return { schemaVersion: SCHEMA_VERSION, colorRegistry: {}, records: [] }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 校验并补全单条记录，避免脏数据进入统计 */
function normalizeRecord(input: unknown): TimeRecord | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Partial<TimeRecord>
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  const mode = raw.mode === 'countdown' ? 'countdown' : 'countup'
  const status = raw.status === 'running' || raw.status === 'paused' ? raw.status : 'ended'
  const segments: Segment[] = Array.isArray(raw.segments)
    ? raw.segments
        .filter((s) => s && isFiniteNumber(s.start) && (s.end === null || isFiniteNumber(s.end)))
        .map((s) => ({ start: s.start, end: s.end === null ? null : (s.end as number) }))
        .filter((s) => s.end === null || s.end > s.start)
        .sort((a, b) => a.start - b.start)
    : []

  return {
    id: raw.id,
    name: raw.name.trim(),
    colorIndex: isFiniteNumber(raw.colorIndex) ? raw.colorIndex : 0,
    mode,
    targetMs: mode === 'countdown' && isFiniteNumber(raw.targetMs) ? raw.targetMs : null,
    note: typeof raw.note === 'string' ? raw.note : '',
    interrupted: Boolean(raw.interrupted),
    segments,
    status,
    createdAt: isFiniteNumber(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: isFiniteNumber(raw.updatedAt) ? raw.updatedAt : Date.now(),
    revisions: Array.isArray(raw.revisions)
      ? raw.revisions.filter((r) => r && isFiniteNumber(r.at) && typeof r.field === 'string')
      : [],
    ...(isFiniteNumber(raw.deletedAt) ? { deletedAt: raw.deletedAt } : {}),
  }
}

function normalizeStore(input: unknown): StoreFile {
  const raw = (input ?? {}) as Partial<StoreFile>
  const colorRegistry: ColorRegistry = {}
  if (raw.colorRegistry && typeof raw.colorRegistry === 'object') {
    for (const [key, value] of Object.entries(raw.colorRegistry)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        colorRegistry[normalizeName(key)] = Math.floor(value)
      }
    }
  }
  const records = Array.isArray(raw.records)
    ? raw.records.map(normalizeRecord).filter((r): r is TimeRecord => Boolean(r))
    : []
  return { schemaVersion: SCHEMA_VERSION, colorRegistry, records }
}

async function backupCorrupt(filePath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(path.dirname(filePath), `store.corrupt-${stamp}.json`)
  try {
    await fs.copyFile(filePath, target)
  } catch {
    // 备份失败不阻塞启动
  }
  return target
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, filePath)
}

/** 读取数据；不存在则创建空库，损坏则备份后以空库启动 */
export async function readStore(): Promise<StoreFile> {
  const dir = dataDir()
  const file = storePath()
  await fs.mkdir(dir, { recursive: true })

  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      const empty = emptyStore()
      await atomicWrite(file, JSON.stringify(empty, null, 2))
      return empty
    }
    throw createError({ statusCode: 500, statusMessage: '读取数据文件失败' })
  }

  try {
    const parsed = JSON.parse(text)
    const store = normalizeStore(parsed)
    if (typeof parsed?.schemaVersion !== 'number') {
      // 最小迁移：补 schema 版本并回写
      await atomicWrite(file, JSON.stringify(store, null, 2))
    }
    return store
  } catch {
    const backup = await backupCorrupt(file)
    lastWarning = `数据文件损坏，已备份为 ${path.basename(backup)}，当前以空库启动。`
    const empty = emptyStore()
    await atomicWrite(file, JSON.stringify(empty, null, 2))
    return empty
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true })
  await atomicWrite(storePath(), JSON.stringify(store, null, 2))
}

/** 串行写队列：所有写操作排队执行，避免并发覆盖 */
let queue: Promise<unknown> = Promise.resolve()

export function mutateStore<T>(mutator: (store: StoreFile) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore()
    const result = await mutator(store)
    await writeStore(store)
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

/** GET /api/data */
export async function getData(): Promise<DataResponse> {
  const store = await readStore()
  const visible = store.records.filter((r) => !r.deletedAt)
  const active = visible.find((r) => isActive(r)) ?? null
  const warning = lastWarning
  lastWarning = null
  return {
    schemaVersion: store.schemaVersion,
    records: visible,
    colorRegistry: store.colorRegistry,
    active,
    warning,
  }
}

/** 校验名称并返回展示用写法 */
function requireName(name: unknown): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw createError({ statusCode: 400, statusMessage: '名称不能为空' })
  }
  return name.trim()
}

function validateSegments(input: unknown): Segment[] {
  if (!Array.isArray(input)) {
    throw createError({ statusCode: 400, statusMessage: '分段格式不正确' })
  }
  const segments: Segment[] = []
  for (const item of input) {
    if (!item || !isFiniteNumber(item.start)) {
      throw createError({ statusCode: 400, statusMessage: '分段开始时间不正确' })
    }
    if (item.end !== null && !isFiniteNumber(item.end)) {
      throw createError({ statusCode: 400, statusMessage: '分段结束时间不正确' })
    }
    if (item.end !== null && item.end <= item.start) {
      throw createError({ statusCode: 400, statusMessage: '分段结束时间必须晚于开始时间' })
    }
    segments.push({ start: item.start, end: item.end ?? null })
  }
  if (!segments.length) {
    throw createError({ statusCode: 400, statusMessage: '记录至少需要一个分段' })
  }
  return segments.sort((a, b) => a.start - b.start)
}

/** POST /api/records */
export async function createRecord(payload: CreateRecordPayload): Promise<TimeRecord> {
  const name = requireName(payload?.name)
  const mode = payload.mode === 'countdown' ? 'countdown' : 'countup'
  let targetMs: number | null = null
  if (mode === 'countdown') {
    if (!isFiniteNumber(payload.targetMs) || payload.targetMs < MINUTE_MS || payload.targetMs > MAX_COUNTDOWN_MS) {
      throw createError({ statusCode: 400, statusMessage: '倒计时时长需在 1 分钟到 24 小时之间' })
    }
    targetMs = Math.round(payload.targetMs)
  }

  const now = Date.now()
  const startedAt = isFiniteNumber(payload.startedAt) ? payload.startedAt : now
  const endedAt = isFiniteNumber(payload.endedAt) ? payload.endedAt : null
  if (endedAt !== null && endedAt <= startedAt) {
    throw createError({ statusCode: 400, statusMessage: '结束时间必须晚于开始时间' })
  }

  return mutateStore((store) => {
    const { colorIndex, registry } = ensureColor(name, store.colorRegistry)
    store.colorRegistry = registry
    const record: TimeRecord = {
      id: crypto.randomUUID(),
      name,
      colorIndex,
      mode,
      targetMs,
      note: typeof payload.note === 'string' ? payload.note.trim() : '',
      interrupted: false,
      segments: [{ start: startedAt, end: endedAt }],
      status: endedAt === null ? 'running' : 'ended',
      createdAt: now,
      updatedAt: now,
      revisions: [],
    }
    store.records.push(record)
    return record
  })
}

const REVISION_FIELDS: (keyof UpdateRecordPayload)[] = [
  'name',
  'note',
  'mode',
  'targetMs',
  'interrupted',
  'status',
  'segments',
]

/** PATCH /api/records/[id]：服务端按库内当前值计算改前/改后 */
export async function updateRecord(id: string, payload: UpdateRecordPayload): Promise<TimeRecord> {
  return mutateStore((store) => {
    const record = store.records.find((r) => r.id === id && !r.deletedAt)
    if (!record) throw createError({ statusCode: 404, statusMessage: '记录不存在' })

    const now = Date.now()
    const revisions = record.revisions

    for (const field of REVISION_FIELDS) {
      if (payload[field] === undefined) continue
      const before = record[field]

      if (field === 'name') {
        const nextName = requireName(payload.name)
        if (nextName === record.name) continue
        const { colorIndex, registry } = ensureColor(nextName, store.colorRegistry)
        store.colorRegistry = registry
        record.colorIndex = colorIndex
        record.name = nextName
        revisions.push({ at: now, field: 'name', before, after: nextName })
        continue
      }

      if (field === 'segments') {
        const nextSegments = validateSegments(payload.segments)
        const beforeJson = JSON.stringify(record.segments)
        const afterJson = JSON.stringify(nextSegments)
        if (beforeJson === afterJson) continue
        record.segments = nextSegments
        revisions.push({
          at: now,
          field: 'segments',
          before: JSON.parse(beforeJson),
          after: JSON.parse(afterJson),
        })
        continue
      }

      if (field === 'mode') {
        const nextMode = payload.mode === 'countdown' ? 'countdown' : 'countup'
        if (nextMode === record.mode) continue
        record.mode = nextMode
        revisions.push({ at: now, field: 'mode', before, after: nextMode })
        continue
      }

      if (field === 'targetMs') {
        let nextTarget: number | null = null
        if (record.mode === 'countdown' || payload.mode === 'countdown') {
          if (!isFiniteNumber(payload.targetMs) || payload.targetMs < MINUTE_MS || payload.targetMs > MAX_COUNTDOWN_MS) {
            throw createError({ statusCode: 400, statusMessage: '倒计时时长需在 1 分钟到 24 小时之间' })
          }
          nextTarget = Math.round(payload.targetMs)
        }
        if (nextTarget === record.targetMs) continue
        record.targetMs = nextTarget
        revisions.push({ at: now, field: 'targetMs', before, after: nextTarget })
        continue
      }

      if (field === 'status') {
        const nextStatus = payload.status === 'running' || payload.status === 'paused' ? payload.status : 'ended'
        if (nextStatus === record.status) continue
        record.status = nextStatus
        revisions.push({ at: now, field: 'status', before, after: nextStatus })
        continue
      }

      if (field === 'interrupted') {
        const nextValue = Boolean(payload.interrupted)
        if (nextValue === record.interrupted) continue
        record.interrupted = nextValue
        revisions.push({ at: now, field: 'interrupted', before, after: nextValue })
        continue
      }

      if (field === 'note') {
        const nextNote = typeof payload.note === 'string' ? payload.note.trim() : ''
        if (nextNote === record.note) continue
        record.note = nextNote
        revisions.push({ at: now, field: 'note', before, after: nextNote })
      }
    }

    record.updatedAt = now
    return record
  })
}

/** DELETE /api/records/[id]：软删除并留痕 */
export async function deleteRecord(id: string): Promise<{ ok: true }> {
  return mutateStore((store) => {
    const record = store.records.find((r) => r.id === id && !r.deletedAt)
    if (!record) throw createError({ statusCode: 404, statusMessage: '记录不存在' })
    const now = Date.now()
    record.deletedAt = now
    // 删除运行中记录时，把开放段以删除时刻收口，避免留下悬挂段
    if (record.status === 'running' && record.segments.some((s) => s.end === null)) {
      record.segments = record.segments.map((s) => (s.end === null ? { ...s, end: now } : s))
    }
    record.status = 'ended'
    record.updatedAt = now
    record.revisions.push({ at: now, field: 'deleted', before: false, after: true })
    return { ok: true }
  })
}

/** 导出用全量数据（包含已删除记录的痕迹） */
export async function exportStore(): Promise<StoreFile> {
  return readStore()
}

/** 供 API 层捕获错误并返回统一 JSON */
export function handleApiError(event: H3Event, error: unknown): never {
  const statusCode =
    typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode: number }).statusCode) || 500
      : 500
  const statusMessage =
    typeof error === 'object' && error && 'statusMessage' in error
      ? String((error as { statusMessage: string }).statusMessage)
      : '服务端处理失败'
  throw createError({ statusCode, statusMessage, cause: error })
}