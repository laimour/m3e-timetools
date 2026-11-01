/**
 * 记录数据源：所有写操作经此 composable，失败时明确提示，不假装成功。
 */
import { computed, ref } from 'vue'
import type {
  ColorRegistry,
  CreateRecordPayload,
  DataResponse,
  TimeRecord,
  UpdateRecordPayload,
} from '~~/shared/types'
import { isActive } from '~~/shared/utils/time'
import { useToasts } from './useToasts'

export interface NameHistoryItem {
  name: string
  colorIndex: number
  count: number
  lastUsed: number
}

export function useRecords() {
  const records = useState<TimeRecord[]>('m3e-records', () => [])
  const colorRegistry = useState<ColorRegistry>('m3e-color-registry', () => ({}))
  const ready = useState<boolean>('m3e-ready', () => false)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const { push } = useToasts()

  const activeRecord = computed<TimeRecord | null>(
    () => records.value.find((record) => isActive(record)) ?? null,
  )

  /** 历史名称按使用频次排序（常用置顶，同频次按最近使用） */
  const nameHistory = computed<NameHistoryItem[]>(() => {
    const map = new Map<string, NameHistoryItem>()
    for (const record of records.value) {
      const key = record.name.trim().toLowerCase()
      if (!key) continue
      const item = map.get(key) ?? {
        name: record.name,
        colorIndex: record.colorIndex,
        count: 0,
        lastUsed: 0,
      }
      item.count += 1
      if (record.updatedAt > item.lastUsed) {
        item.lastUsed = record.updatedAt
        item.name = record.name
        item.colorIndex = record.colorIndex
      }
      map.set(key, item)
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 16)
  })

  function upsert(record: TimeRecord) {
    const index = records.value.findIndex((item) => item.id === record.id)
    if (index >= 0) {
      const next = records.value.slice()
      next[index] = record
      records.value = next
    } else {
      records.value = [...records.value, record]
    }
  }

  async function load() {
    if (loading.value) return
    loading.value = true
    loadError.value = null
    try {
      const data = await $fetch<DataResponse>('/api/data')
      records.value = data.records
      colorRegistry.value = data.colorRegistry
      ready.value = true
      if (data.warning) {
        push(data.warning, 'warn', 8000)
      }
    } catch {
      loadError.value = '读取数据失败，请稍后重试'
      push('读取数据失败，请稍后重试', 'danger', 6000)
    } finally {
      loading.value = false
    }
  }

  async function createRecord(payload: CreateRecordPayload): Promise<TimeRecord | null> {
    try {
      const record = await $fetch<TimeRecord>('/api/records', { method: 'POST', body: payload })
      upsert(record)
      return record
    } catch (error) {
      push(readErrorMessage(error, '保存失败，数据仍在本地待重试'), 'danger', 6000)
      return null
    }
  }

  async function patchRecord(id: string, payload: UpdateRecordPayload): Promise<TimeRecord | null> {
    try {
      const record = await $fetch<TimeRecord>(`/api/records/${id}`, { method: 'PATCH', body: payload })
      upsert(record)
      return record
    } catch (error) {
      push(readErrorMessage(error, '保存失败，数据仍在本地待重试'), 'danger', 6000)
      return null
    }
  }

  async function deleteRecord(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/records/${id}`, { method: 'DELETE' })
      records.value = records.value.filter((record) => record.id !== id)
      return true
    } catch (error) {
      push(readErrorMessage(error, '删除失败，请稍后重试'), 'danger', 6000)
      return false
    }
  }

  return {
    records,
    colorRegistry,
    ready,
    loading,
    loadError,
    activeRecord,
    nameHistory,
    load,
    createRecord,
    patchRecord,
    deleteRecord,
  }
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { statusMessage?: string; message?: string } }).data
    const message = data?.statusMessage || data?.message
    if (message) return message
  }
  return fallback
}
