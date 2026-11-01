<template>
  <M3Modal
    :model-value="modelValue"
    title="处理未结束的计时"
    width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="record" class="resume">
      <div class="resume-head">
        <span class="resume-dot" :style="{ background: color }" />
        <span class="resume-name">{{ record.name }}</span>
        <span class="resume-status">{{ record.status === 'paused' ? '已暂停' : '运行中' }}</span>
      </div>

      <div class="resume-info">
        <span>开始于 {{ formatDateTime(startAt ?? nowValue) }}</span>
        <span>净计时 {{ formatDuration(netMs(record, nowValue)) }}</span>
        <span v-if="record.targetMs">设定 {{ formatDuration(record.targetMs) }}</span>
      </div>

      <p v-if="overdueMs > 0" class="overdue">
        倒计时已越过推定结束点 {{ formatDuration(overdueMs) }}，建议算到推定结束点。
      </p>

      <div class="options" role="radiogroup" aria-label="处理方式">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="option"
          :class="{ active: selected === option.value }"
          role="radio"
          :aria-checked="selected === option.value"
          @click="selected = option.value"
        >
          <span class="option-radio" />
          <span class="option-text">
            <span class="option-label">{{ option.label }}</span>
            <span class="option-hint">{{ option.hint }}</span>
          </span>
        </button>
      </div>

      <M3Input
        v-if="selected === 'at'"
        v-model="customAt"
        label="结束于指定时间"
        type="datetime-local"
      />

      <span v-if="error" class="error" role="alert">{{ error }}</span>
    </div>

    <template #footer>
      <M3Button variant="ghost" @click="emit('update:modelValue', false)">稍后处理</M3Button>
      <M3Button variant="primary" @click="confirm">确认</M3Button>
    </template>
  </M3Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import { colorForIndex } from '~~/shared/utils/color'
import {
  countdownEnd,
  firstStart,
  formatDateTime,
  formatDuration,
  formatTime,
  netMs,
  parseLocalDateTime,
  toDateTimeLocal,
} from '~~/shared/utils/time'

type ResumeAction = 'now' | 'estimated' | 'at' | 'continue'

const props = defineProps<{
  modelValue: boolean
  record: TimeRecord | null
  now: number
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'resolve', payload: { action: ResumeAction; at?: number }): void
}>()

const selected = ref<ResumeAction>('now')
const customAt = ref('')
const error = ref('')

const nowValue = computed(() => props.now || Date.now())
const color = computed(() => (props.record ? colorForIndex(props.record.colorIndex) : ''))
const startAt = computed(() => (props.record ? firstStart(props.record) : null))

const estimatedEnd = computed(() => (props.record ? countdownEnd(props.record) : null))
const overdueMs = computed(() => {
  if (!props.record || !estimatedEnd.value) return 0
  return Math.max(0, nowValue.value - estimatedEnd.value)
})

const options = computed(() => {
  const record = props.record
  const countdown = record?.mode === 'countdown' && record.targetMs
  const list: { value: ResumeAction; label: string; hint: string }[] = [
    {
      value: 'now',
      label: '算到现在',
      hint: `以当前时间 ${formatTime(nowValue.value)} 收口`,
    },
  ]
  if (countdown && estimatedEnd.value) {
    list.push({
      value: 'estimated',
      label: '算到推定结束点',
      hint: `结束于 ${formatTime(estimatedEnd.value)}（首段开始 + 设定时长）`,
    })
  }
  list.push({
    value: 'at',
    label: '结束于指定时间',
    hint: '手动输入一个不晚于现在的结束时刻',
  })
  if (record?.status === 'running' || record?.status === 'paused') {
    list.push({
      value: 'continue',
      label: '继续计时',
      hint: record.status === 'paused' ? '从暂停时刻之后新开一段继续' : '保持原段继续计时',
    })
  }
  return list
})

watch(
  () => [props.modelValue, props.record?.id] as const,
  ([open]) => {
    if (!open || !props.record) return
    const record = props.record
    if (record.status === 'paused') selected.value = 'continue'
    else if (record.mode === 'countdown' && estimatedEnd.value && nowValue.value >= estimatedEnd.value) {
      selected.value = 'estimated'
    } else if (record.mode === 'countdown' && estimatedEnd.value) {
      selected.value = 'estimated'
    } else {
      selected.value = 'now'
    }
    customAt.value = toDateTimeLocal(nowValue.value)
    error.value = ''
  },
  { immediate: true },
)

function confirm() {
  error.value = ''
  const record = props.record
  if (!record) return

  if (selected.value === 'estimated') {
    if (!estimatedEnd.value) {
      error.value = '该记录没有推定结束点'
      return
    }
    emit('resolve', { action: 'estimated', at: estimatedEnd.value })
    return
  }

  if (selected.value === 'at') {
    const at = parseLocalDateTime(customAt.value)
    if (at === null) {
      error.value = '时间格式不正确'
      return
    }
    if (startAt.value !== null && at <= startAt.value) {
      error.value = '结束时间必须晚于开始时间'
      return
    }
    if (at > Date.now() + 60_000) {
      error.value = '结束时间不能晚于现在'
      return
    }
    emit('resolve', { action: 'at', at })
    return
  }

  if (selected.value === 'continue') {
    emit('resolve', { action: 'continue' })
    return
  }

  emit('resolve', { action: 'now', at: nowValue.value })
}
</script>

<style scoped>
.resume {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resume-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resume-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.resume-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--m3e-text);
}

.resume-status {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--m3e-warn);
  background: rgba(216, 192, 143, 0.1);
  padding: 2px 8px;
  border-radius: 999px;
}

.resume-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.overdue {
  margin: 0;
  font-size: 11.5px;
  color: var(--m3e-warn);
  background: rgba(216, 192, 143, 0.08);
  padding: 9px 11px;
  border-radius: 10px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--m3e-surface-2);
  text-align: left;
  transition: background-color 160ms ease-out;
}

.option:hover {
  background: var(--m3e-surface-3);
}

.option.active {
  background: var(--m3e-accent-ghost);
}

.option-radio {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid var(--m3e-text-3);
  margin-top: 2px;
  flex-shrink: 0;
  position: relative;
}

.option.active .option-radio {
  border-color: var(--m3e-accent);
}

.option.active .option-radio::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--m3e-accent);
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-size: 12.5px;
  color: var(--m3e-text);
}

.option-hint {
  font-size: 10.5px;
  color: var(--m3e-text-3);
}

.error {
  font-size: 11.5px;
  color: var(--m3e-danger);
}
</style>
