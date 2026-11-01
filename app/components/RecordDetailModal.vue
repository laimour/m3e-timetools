<template>
  <M3Modal
    :model-value="modelValue"
    title="记录详情"
    width="560px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="record">
      <div class="detail-head">
        <span class="detail-dot" :style="{ background: color }" />
        <span class="detail-name">{{ record.name }}</span>
        <span class="detail-tag">{{ record.mode === 'countdown' ? '倒计时' : '正计时' }}</span>
        <span v-if="record.interrupted" class="detail-tag">有中断</span>
        <span class="detail-status" :class="{ paused: record.status === 'paused' }">{{ statusLabel }}</span>
      </div>

      <div class="big-row">
        <div class="big-block">
          <span class="mini-label">净时长</span>
          <div class="big-value tabular">{{ formatDuration(net) }}</div>
        </div>
        <div class="big-block">
          <span class="mini-label">首尾跨度</span>
          <div class="mid-value tabular">{{ formatDuration(span) }}</div>
        </div>
        <div class="big-block">
          <span class="mini-label">暂停</span>
          <div class="mid-value tabular">{{ gaps.length }} 次 · {{ formatDuration(paused) }}</div>
        </div>
      </div>

      <div class="summary-line">
        <span class="mini-label">起止</span>
        <span class="summary-text tabular">{{ rangeText }}</span>
        <span v-if="record.targetMs" class="summary-text">设定 {{ formatDuration(record.targetMs) }}</span>
      </div>

      <section class="edit-section">
        <h3 class="section-title">编辑</h3>
        <div class="edit-grid">
          <M3Input v-model="draftName" label="名称" :maxlength="40" />
          <M3Input v-model="draftStart" label="开始时间" type="datetime-local" />
          <M3Input
            v-model="draftEnd"
            label="结束时间"
            type="datetime-local"
            :hint="record.status === 'running' ? '进行中，结束时间随计时更新' : undefined"
          />
        </div>
        <label class="note-field">
          <span class="mini-label">备注</span>
          <textarea v-model="draftNote" rows="2" maxlength="120" placeholder="可选" />
        </label>
        <label class="interrupt-field">
          <input v-model="draftInterrupted" type="checkbox" />
          <span>标记为「有中断」（只做分类，净时长仍计入有效）</span>
        </label>
        <div v-if="editError" class="edit-error" role="alert">{{ editError }}</div>
        <div class="edit-actions">
          <M3Button variant="primary" size="sm" @click="save">保存修改</M3Button>
          <M3Button variant="ghost" size="sm" @click="resetDraft">还原</M3Button>
        </div>
      </section>

      <section v-if="gaps.length" class="pause-section">
        <h3 class="section-title">暂停区间</h3>
        <div class="pause-list">
          <div v-for="(gap, index) in gaps" :key="index" class="pause-row">
            <span class="pause-index">{{ index + 1 }}</span>
            <span class="pause-time tabular">{{ timeRange(gap.start, gap.end) }}</span>
            <span class="pause-duration tabular">{{ formatDuration(gap.end - gap.start) }}</span>
          </div>
        </div>
      </section>

      <section class="revision-section">
        <h3 class="section-title">修改记录</h3>
        <div v-if="sortedRevisions.length" class="revision-list">
          <div v-for="(rev, index) in sortedRevisions" :key="index" class="revision-row">
            <span class="revision-field">{{ fieldLabel(rev.field) }}</span>
            <span class="revision-value tabular">{{ describeValue(rev.field, rev.before) }}</span>
            <span class="revision-arrow">→</span>
            <span class="revision-value current tabular">{{ describeValue(rev.field, rev.after) }}</span>
            <span class="revision-at tabular">{{ formatDateTime(rev.at) }}</span>
          </div>
        </div>
        <span v-else class="revision-empty">暂无修改记录</span>
      </section>

      <section class="delete-section">
        <template v-if="confirmDelete">
          <span class="delete-hint">确认删除？删除后会保留一条删除痕迹。</span>
          <div class="delete-actions">
            <M3Button variant="danger" size="sm" @click="emit('delete', record.id)">确认删除</M3Button>
            <M3Button variant="ghost" size="sm" @click="confirmDelete = false">取消</M3Button>
          </div>
        </template>
        <M3Button v-else variant="danger" size="sm" @click="confirmDelete = true">删除记录</M3Button>
      </section>
    </template>
  </M3Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Revision, Segment, TimeRecord, UpdateRecordPayload } from '~~/shared/types'
import { colorForIndex } from '~~/shared/utils/color'
import { pauseGaps } from '~~/shared/utils/stats'
import {
  formatDateTime,
  formatDuration,
  formatTime,
  firstStart,
  lastEnd,
  netMs,
  parseLocalDateTime,
  pausedMs,
  retimeSegments,
  spanMs,
  toDateTimeLocal,
} from '~~/shared/utils/time'

const props = defineProps<{
  modelValue: boolean
  record: TimeRecord | null
  now: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save', payload: UpdateRecordPayload): void
  (event: 'delete', id: string): void
}>()

const draftName = ref('')
const draftStart = ref('')
const draftEnd = ref('')
const draftNote = ref('')
const draftInterrupted = ref(false)
const editError = ref('')
const confirmDelete = ref(false)

const nowValue = computed(() => props.now || Date.now())
const record = computed(() => props.record)
const color = computed(() => (record.value ? colorForIndex(record.value.colorIndex) : ''))
const net = computed(() => (record.value ? netMs(record.value, nowValue.value) : 0))
const span = computed(() => (record.value ? spanMs(record.value, nowValue.value) : 0))
const paused = computed(() => (record.value ? pausedMs(record.value, nowValue.value) : 0))
const gaps = computed(() => (record.value ? pauseGaps(record.value.segments) : []))

const statusLabel = computed(() => {
  if (!record.value) return ''
  if (record.value.status === 'running') return '进行中'
  if (record.value.status === 'paused') return '已暂停'
  return '已结束'
})

const rangeText = computed(() => {
  if (!record.value) return ''
  const start = firstStart(record.value)
  const end = lastEnd(record.value, nowValue.value)
  if (start === null) return '—'
  return `${formatDateTime(start)} → ${record.value.status === 'running' ? '现在' : formatDateTime(end ?? start)}`
})

const sortedRevisions = computed<Revision[]>(() =>
  record.value ? [...record.value.revisions].sort((a, b) => b.at - a.at) : [],
)

watch(
  () => [props.modelValue, props.record?.id] as const,
  ([open]) => {
    if (open) resetDraft()
  },
  { immediate: true },
)

function resetDraft() {
  const value = record.value
  if (!value) return
  const start = firstStart(value)
  const end = lastEnd(value, nowValue.value)
  draftName.value = value.name
  draftStart.value = start ? toDateTimeLocal(start) : ''
  draftEnd.value = end ? toDateTimeLocal(end) : ''
  draftNote.value = value.note
  draftInterrupted.value = value.interrupted
  editError.value = ''
  confirmDelete.value = false
}

function save() {
  const value = record.value
  if (!value) return
  editError.value = ''
  const name = draftName.value.trim()
  if (!name) {
    editError.value = '名称不能为空'
    return
  }
  const start = parseLocalDateTime(draftStart.value)
  if (start === null) {
    editError.value = '开始时间格式不正确'
    return
  }

  let end: number | null = null
  if (value.status !== 'running') {
    end = parseLocalDateTime(draftEnd.value)
    if (end === null) {
      editError.value = '结束时间格式不正确'
      return
    }
    if (end <= start) {
      editError.value = '结束时间必须晚于开始时间'
      return
    }
    const last = value.segments[value.segments.length - 1]
    if (last && end <= last.start) {
      editError.value = '结束时间不能早于最后一段的开始时间'
      return
    }
  }

  const segments = retimeSegments(
    value.segments.map((seg) => ({ ...seg })) as Segment[],
    start,
    value.status === 'running' ? null : end,
  )

  emit('save', {
    name,
    note: draftNote.value.trim(),
    interrupted: draftInterrupted.value,
    segments,
  })
}

function timeRange(start: number, end: number): string {
  return `${formatDateTime(start)} → ${formatDateTime(end)}`
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: '名称',
    note: '备注',
    mode: '模式',
    targetMs: '倒计时时长',
    interrupted: '中断标记',
    status: '状态',
    segments: '时间',
    deleted: '删除',
  }
  return labels[field] ?? field
}

function describeValue(field: string, value: unknown): string {
  if (field === 'segments') {
    if (!Array.isArray(value) || !value.length) return '无'
    const segments = value as Segment[]
    const start = segments[0]?.start
    const last = segments[segments.length - 1]
    if (!start || !last) return '无'
    const end = last.end ?? props.now
    return `${segments.length} 段 · ${formatTime(start)} – ${last.end === null ? '现在' : formatTime(end)}`
  }
  if (field === 'mode') return value === 'countdown' ? '倒计时' : '正计时'
  if (field === 'status') {
    if (value === 'running') return '进行中'
    if (value === 'paused') return '已暂停'
    return '已结束'
  }
  if (field === 'targetMs') {
    return typeof value === 'number' ? formatDuration(value) : '无'
  }
  if (field === 'interrupted') return value ? '是' : '否'
  if (field === 'deleted') return value ? '已删除' : '未删除'
  if (typeof value === 'string') return value || '空'
  if (value === null || value === undefined) return '空'
  return String(value)
}
</script>

<style scoped>
.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.detail-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.detail-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--m3e-text);
}

.detail-tag {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--m3e-surface-2);
  color: var(--m3e-text-3);
}

.detail-status {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--m3e-accent);
  background: var(--m3e-accent-ghost);
  padding: 2px 8px;
  border-radius: 999px;
}

.detail-status.paused {
  color: var(--m3e-warn);
  background: rgba(216, 192, 143, 0.1);
}

.big-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--m3e-surface-2);
}

.big-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.mini-label {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.big-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--m3e-text);
  line-height: 1.1;
}

.mid-value {
  font-size: 13px;
  color: var(--m3e-text-2);
  line-height: 1.6;
}

.summary-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.summary-text {
  font-size: 12px;
  color: var(--m3e-text-2);
}

.edit-section,
.pause-section,
.revision-section,
.delete-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--m3e-border);
}

.section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.edit-grid :deep(.m3-input:first-child) {
  grid-column: 1 / -1;
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.note-field textarea {
  resize: vertical;
  min-height: 54px;
}

.interrupt-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--m3e-text-3);
  cursor: pointer;
}

.interrupt-field input {
  accent-color: var(--m3e-accent);
  width: 14px;
  height: 14px;
}

.edit-error {
  font-size: 11.5px;
  color: var(--m3e-danger);
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.pause-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pause-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11.5px;
  color: var(--m3e-text-2);
}

.pause-index {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: var(--m3e-surface-2);
  font-size: 10px;
  color: var(--m3e-text-3);
}

.pause-time {
  flex: 1;
}

.pause-duration {
  color: var(--m3e-text-3);
}

.revision-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 160px;
  overflow-y: auto;
}

.revision-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--m3e-text-3);
}

.revision-field {
  color: var(--m3e-text-2);
  min-width: 48px;
}

.revision-value {
  color: var(--m3e-text-3);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revision-value.current {
  color: var(--m3e-text-2);
}

.revision-arrow {
  color: var(--m3e-text-3);
}

.revision-at {
  margin-left: auto;
  font-size: 10px;
  color: var(--m3e-text-3);
}

.revision-empty {
  font-size: 11px;
  color: var(--m3e-text-3);
}

.delete-section {
  align-items: flex-start;
}

.delete-hint {
  font-size: 11.5px;
  color: var(--m3e-danger);
}

.delete-actions {
  display: flex;
  gap: 8px;
}
</style>
