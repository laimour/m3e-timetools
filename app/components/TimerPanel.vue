<template>
  <M3Card title="计时">
    <template #action>
      <M3Button variant="ghost" size="sm" @click="openManual">
        补记
      </M3Button>
    </template>

    <div v-if="notice" class="notice" role="alert">
      <div class="notice-text">
        <span class="notice-title">「{{ notice.name }}」倒计时结束</span>
        <span class="notice-sub">结束于 {{ formatTime(notice.endedAt) }}，已自动写入今天</span>
      </div>
      <button type="button" class="notice-close" aria-label="关闭提醒" @click="emit('dismiss-notice')">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div v-if="pendingResume && active" class="pending" role="status">
      <div class="pending-text">
        <span class="pending-title">有未结束的计时</span>
        <span class="pending-sub">「{{ active.name }}」需要你选择如何处理</span>
      </div>
      <M3Button variant="primary" size="sm" @click="emit('resume-prompt')">去处理</M3Button>
    </div>

    <!-- 运行中 / 暂停中 -->
    <template v-if="active && !expanded">
      <div class="active-block">
        <div class="active-top">
          <span class="active-dot" :style="{ background: activeColor }" />
          <span class="active-name">{{ active.name }}</span>
          <span class="active-badge" :class="{ paused: active.status === 'paused' }">
            {{ active.status === 'paused' ? '已暂停' : '进行中' }}
          </span>
        </div>

        <div class="timer-big tabular">{{ bigTime }}</div>
        <div class="timer-sub">{{ subtitle }}</div>

        <div v-if="countdownRatio !== null" class="countdown-bar">
          <WaveBar
            :value="countdownRatio"
            :thickness="7"
            tone="accent"
            aria-label="倒计时进度"
          />
          <span class="bar-caption">{{ elapsedText }} / {{ targetText }}</span>
        </div>

        <div v-if="active.status === 'paused'" class="pause-note">
          已暂停 · 暂停累计 {{ pausedText }} · 暂停 {{ pauseCount }} 次
        </div>

        <div class="active-actions">
          <M3Button
            v-if="active.status === 'running'"
            variant="primary"
            @click="emit('pause')"
          >
            暂停
          </M3Button>
          <M3Button v-else variant="primary" @click="emit('resume')">继续</M3Button>
          <M3Button variant="subtle" @click="emit('stop')">结束</M3Button>
          <M3Button variant="ghost" @click="openForm">新计时</M3Button>
        </div>
      </div>

      <div v-if="quickHistory.length" class="quick">
        <span class="quick-label">历史事件 · 点选立即切换</span>
        <div class="quick-list">
          <button
            v-for="item in quickHistory"
            :key="item.name"
            type="button"
            class="quick-chip"
            @click="quickStart(item.name)"
          >
            <span class="chip-dot" :style="{ background: colorForIndex(item.colorIndex) }" />
            {{ item.name }}
          </button>
        </div>
      </div>
    </template>

    <!-- 命名表单 -->
    <template v-else-if="expanded">
      <div class="start-form">
        <NamePicker
          v-model="draftName"
          :history="history"
          :autofocus="true"
          @submit="submitStart"
        />

        <div class="field">
          <span class="field-label">模式</span>
          <M3Segmented v-model="draftMode" :options="modeOptions" />
        </div>

        <div v-if="draftMode === 'countdown'" class="field">
          <span class="field-label">倒计时时长</span>
          <M3Segmented v-model="preset" :options="presetOptions" />
          <div v-if="preset === 'custom'" class="custom-time">
            <M3Input
              v-model="customMinutes"
              type="number"
              min="1"
              max="1440"
              placeholder="分钟数"
              inputmode="numeric"
            />
            <span class="custom-unit">分钟（1 – 1440）</span>
          </div>
        </div>

        <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>

        <div class="form-actions">
          <M3Button variant="solid" @click="submitStart">开始</M3Button>
          <M3Button variant="ghost" @click="closeForm">取消</M3Button>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-copy">
        <span class="empty-title">当前没有计时</span>
        <span class="empty-sub">先命名，再开始；名称必填</span>
      </div>
      <M3Button variant="solid" block @click="openForm">开始计时</M3Button>
    </div>

    <M3Modal v-model="manualOpen" title="补记一条记录" width="480px">
      <div class="manual-form">
        <M3Input v-model="manualName" label="名称" placeholder="例如：晨间阅读" :maxlength="40" />
        <div class="manual-row">
          <M3Input v-model="manualDate" label="日期" type="date" />
          <M3Input v-model="manualStart" label="开始" type="time" />
          <M3Input v-model="manualEnd" label="结束" type="time" />
        </div>
        <span class="manual-hint">结束时间早于开始时间时，自动视为次日结束（支持跨零点）</span>
        <M3Input v-model="manualNote" label="备注" placeholder="可选" :maxlength="120" />
        <div v-if="manualError" class="form-error" role="alert">{{ manualError }}</div>
      </div>
      <template #footer>
        <M3Button variant="ghost" @click="manualOpen = false">取消</M3Button>
        <M3Button variant="primary" @click="submitManual">保存</M3Button>
      </template>
    </M3Modal>
  </M3Card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import { colorForIndex } from '~~/shared/utils/color'
import {
  countdownEnd,
  DAY_MS,
  dayKey,
  formatDuration,
  formatTime,
  formatTimer,
  netMs,
  parseDateAndTime,
  pausedMs,
  firstStart,
} from '~~/shared/utils/time'
import { pauseGaps } from '~~/shared/utils/stats'
import type { NameHistoryItem } from '~/composables/useRecords'
import type { ExpiredNotice } from '~/composables/useTimer'

const props = defineProps<{
  active: TimeRecord | null
  now: number
  history: NameHistoryItem[]
  notice: ExpiredNotice | null
  pendingResume: boolean
}>()

const emit = defineEmits<{
  (event: 'start', payload: { name: string; mode: 'countup' | 'countdown'; targetMs: number | null }): void
  (event: 'pause'): void
  (event: 'resume'): void
  (event: 'stop'): void
  (event: 'open', id: string): void
  (event: 'manual', payload: { name: string; start: number; end: number; note: string }): void
  (event: 'resume-prompt'): void
  (event: 'dismiss-notice'): void
}>()

const expanded = ref(false)
const draftName = ref('')
const draftMode = ref<'countup' | 'countdown'>('countup')
const preset = ref<'15' | '25' | '45' | '60' | 'custom'>('25')
const customMinutes = ref('')
const formError = ref('')

const modeOptions = [
  { value: 'countup', label: '正计时' },
  { value: 'countdown', label: '倒计时' },
]

const presetOptions = [
  { value: '15', label: '15 分' },
  { value: '25', label: '25 分' },
  { value: '45', label: '45 分' },
  { value: '60', label: '60 分' },
  { value: 'custom', label: '自定义' },
]

const activeColor = computed(() => (props.active ? colorForIndex(props.active.colorIndex) : ''))
const elapsed = computed(() => (props.active ? netMs(props.active, props.now) : 0))
const pausedTotal = computed(() => (props.active ? pausedMs(props.active, props.now) : 0))
const pauseCount = computed(() => (props.active ? pauseGaps(props.active.segments).length : 0))
const pausedText = computed(() => formatDuration(pausedTotal.value))

const remaining = computed(() => {
  if (!props.active) return 0
  const end = countdownEnd(props.active)
  if (!end) return 0
  return Math.max(0, end - props.now)
})

const bigTime = computed(() => {
  if (!props.active) return '00:00:00'
  return formatTimer(props.active.mode === 'countdown' ? remaining.value : elapsed.value)
})

const targetText = computed(() =>
  props.active?.targetMs ? formatDuration(props.active.targetMs) : '',
)
const elapsedText = computed(() => formatDuration(Math.max(0, (props.active?.targetMs ?? 0) - remaining.value)))

const subtitle = computed(() => {
  if (!props.active) return ''
  const start = firstStart(props.active)
  const startText = start ? `开始于 ${formatTime(start)}` : ''
  if (props.active.mode === 'countdown') {
    const end = countdownEnd(props.active)
    return `${formatDuration(props.active.targetMs ?? 0)} · ${startText}${
      end ? ` · 结束 ${formatTime(end)}` : ''
    }`
  }
  return `正计时 · ${startText}`
})

const countdownRatio = computed(() => {
  if (!props.active || props.active.mode !== 'countdown' || !props.active.targetMs) return null
  const start = firstStart(props.active)
  if (start === null) return null
  const total = props.active.targetMs
  return Math.min(1, Math.max(0, (props.now - start) / total))
})

const quickHistory = computed(() =>
  props.history.filter((item) => item.name.trim().toLowerCase() !== props.active?.name.trim().toLowerCase()).slice(0, 8),
)

function openForm() {
  expanded.value = true
  formError.value = ''
  if (!draftName.value && quickHistory.value.length) {
    draftName.value = ''
  }
}

function closeForm() {
  expanded.value = false
  formError.value = ''
}

function submitStart() {
  formError.value = ''
  const name = draftName.value.trim()
  if (!name) {
    formError.value = '名称不能为空，请先填写名称'
    return
  }

  let targetMs: number | null = null
  if (draftMode.value === 'countdown') {
    if (preset.value === 'custom') {
      const minutes = Number(customMinutes.value)
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
        formError.value = '自定义时长需为 1 – 1440 分钟'
        return
      }
      targetMs = Math.round(minutes) * 60_000
    } else {
      targetMs = Number(preset.value) * 60_000
    }
  }

  emit('start', { name, mode: draftMode.value, targetMs })
}

function quickStart(name: string) {
  emit('start', { name, mode: 'countup', targetMs: null })
}

watch(
  () => props.active?.id,
  (id, previous) => {
    if (id && id !== previous) {
      expanded.value = false
      formError.value = ''
      draftName.value = ''
      customMinutes.value = ''
    }
  },
)

/* -------------------------------- 手动补记 -------------------------------- */

const manualOpen = ref(false)
const manualName = ref('')
const manualDate = ref('')
const manualStart = ref('09:00')
const manualEnd = ref('10:00')
const manualNote = ref('')
const manualError = ref('')

function openManual() {
  const base = props.now || Date.now()
  manualName.value = ''
  manualDate.value = dayKey(base)
  manualStart.value = '09:00'
  manualEnd.value = '10:00'
  manualNote.value = ''
  manualError.value = ''
  manualOpen.value = true
}

function submitManual() {
  manualError.value = ''
  const name = manualName.value.trim()
  if (!name) {
    manualError.value = '名称不能为空'
    return
  }
  const start = parseDateAndTime(manualDate.value, manualStart.value)
  let end = parseDateAndTime(manualDate.value, manualEnd.value)
  if (start === null || end === null) {
    manualError.value = '请填写有效的日期与时间'
    return
  }
  if (end <= start) end += DAY_MS
  if (end - start > DAY_MS) {
    manualError.value = '单条补记不能超过 24 小时'
    return
  }
  emit('manual', { name, start, end, note: manualNote.value.trim() })
  manualOpen.value = false
}
</script>

<style scoped>
.notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(216, 192, 143, 0.1);
}

.notice-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.notice-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--m3e-warn);
}

.notice-sub {
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.notice-close {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: var(--m3e-text-3);
}

.notice-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--m3e-text-2);
}

.pending {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--m3e-accent-ghost);
}

.pending-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pending-title {
  font-size: 12.5px;
  color: var(--m3e-accent);
}

.pending-sub {
  font-size: 11px;
  color: var(--m3e-text-3);
}

.active-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.active-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.active-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.active-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--m3e-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-badge {
  margin-left: auto;
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--m3e-accent);
  background: var(--m3e-accent-ghost);
  flex-shrink: 0;
}

.active-badge.paused {
  color: var(--m3e-warn);
  background: rgba(216, 192, 143, 0.1);
}

.timer-big {
  font-size: 46px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  color: var(--m3e-text);
}

.timer-sub {
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.countdown-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bar-caption {
  font-size: 10.5px;
  color: var(--m3e-text-3);
  font-variant-numeric: tabular-nums;
}

.pause-note {
  font-size: 11.5px;
  color: var(--m3e-warn);
}

.active-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 4px;
  border-top: 1px solid var(--m3e-border);
}

.quick-label {
  font-size: 10.5px;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--m3e-surface-2);
  color: var(--m3e-text-2);
  font-size: 11.5px;
  transition: background-color 160ms ease-out;
}

.quick-chip:hover {
  background: var(--m3e-surface-3);
  color: var(--m3e-text);
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-title {
  font-size: 14px;
  color: var(--m3e-text-2);
}

.empty-sub {
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.start-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.custom-time {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-time :deep(input) {
  width: 110px;
}

.custom-unit {
  font-size: 11px;
  color: var(--m3e-text-3);
}

.form-error {
  font-size: 11.5px;
  color: var(--m3e-danger);
}

.form-actions {
  display: flex;
  gap: 8px;
}

.manual-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.manual-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 10px;
}

.manual-hint {
  font-size: 11px;
  color: var(--m3e-text-3);
  margin-top: -6px;
}
</style>