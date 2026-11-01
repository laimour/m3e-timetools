<template>
  <div ref="wrapper" class="time-wheel">
    <svg
      class="wheel-svg"
      viewBox="0 0 640 640"
      role="group"
      aria-label="今天 24 小时时间盘"
    >
      <defs>
        <filter id="m3e-soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <!-- 底环 -->
      <circle
        :cx="CX"
        :cy="CY"
        :r="(R_OUT + R_IN) / 2"
        fill="none"
        stroke="rgba(255, 255, 255, 0.05)"
        :stroke-width="R_OUT - R_IN"
      />

      <!-- 刻度 -->
      <g class="wheel-ticks">
        <line
          v-for="hour in 24"
          :key="hour"
          :x1="tickPoints[hour]?.x1"
          :y1="tickPoints[hour]?.y1"
          :x2="tickPoints[hour]?.x2"
          :y2="tickPoints[hour]?.y2"
          stroke="rgba(255, 255, 255, 0.12)"
          :stroke-width="hour % 6 === 0 ? 1.6 : 1"
        />
      </g>

      <!-- 记录弧段 -->
      <g
        v-for="arc in arcs"
        :key="arc.key"
        class="wheel-arc"
        :class="{ live: arc.live, focused: hovered?.arc.key === arc.key }"
        tabindex="0"
        role="button"
        :aria-label="arc.aria"
        @pointerenter="onEnter(arc, $event)"
        @pointermove="onMove($event)"
        @pointerleave="onLeave"
        @focus="onFocus(arc)"
        @blur="onLeave"
        @click="emit('open', arc.recordId)"
        @keydown.enter.prevent="emit('open', arc.recordId)"
        @keydown.space.prevent="emit('open', arc.recordId)"
      >
        <path
          v-if="arc.live"
          :d="arc.d"
          :fill="arc.color"
          filter="url(#m3e-soft-glow)"
          class="arc-glow"
        />
        <path :d="arc.d" :fill="arc.color" class="arc-fill" />
      </g>

      <!-- 小时文字 -->
      <text
        v-for="label in hourLabels"
        :key="label.text"
        :x="label.x"
        :y="label.y"
        text-anchor="middle"
        dominant-baseline="middle"
        class="wheel-hour-label"
      >
        {{ label.text }}
      </text>

      <!-- 当前时间指针 -->
      <g v-if="dayProgress > 0" class="wheel-pointer" aria-hidden="true">
        <line :x1="CX" :y1="CY" :x2="pointer.x" :y2="pointer.y" stroke="rgba(202, 191, 250, 0.55)" stroke-width="1.2" />
        <circle :cx="pointer.x" :cy="pointer.y" r="4" fill="var(--m3e-accent)" />
        <circle :cx="pointer.x" :cy="pointer.y" r="8" fill="rgba(202, 191, 250, 0.18)" />
      </g>
    </svg>

    <!-- 外圈：今天已过的时间比例（常规圆环，不用波浪） -->
    <div class="ring-layer day-progress" aria-hidden="false">
      <WaveRing
        :value="dayProgress"
        :size="640"
        :thickness="5"
        shape="flat"
        tone="muted"
        aria-label="今天已过时间比例"
      />
    </div>

    <!-- 内圈：倒计时剩余比例（常规圆环，不用波浪） -->
    <div v-if="countdown" class="ring-layer countdown" aria-hidden="false">
      <div class="ring-inner">
        <WaveRing
          :value="countdown.ratio"
          :size="356"
          :thickness="4"
          shape="flat"
          :tone="countdown.ratio < 0.1 ? 'warn' : 'accent'"
          aria-label="倒计时剩余比例"
        />
      </div>
    </div>

    <!-- 盘中心信息 -->
    <div class="wheel-center">
      <span class="center-label">今日累计</span>
      <div class="center-total tabular">
        <strong>{{ todayMain }}</strong>
        <span>{{ todayUnit }}</span>
      </div>
      <div v-if="active" class="center-active">
        <span class="center-dot" :style="{ background: activeColor }" />
        <span class="center-name">{{ active.name }}</span>
        <span class="center-meta">
          {{ active.status === 'paused' ? '已暂停' : '进行中' }} ·
          <span class="tabular">{{ activeValue }}</span>
        </span>
      </div>
      <div v-else class="center-idle">今天还没有进行中的计时</div>
      <div class="center-segments">已完成 {{ todaySegmentCount }} 段</div>

      <div class="center-rings">
        <span class="ring-key">
          <span class="ring-dot outer" aria-hidden="true" />
          外圈 · 今天已过 {{ dayPercent }}%
        </span>
        <span v-if="countdown" class="ring-key">
          <span class="ring-dot inner" aria-hidden="true" />
          内圈 · 倒计时剩余 {{ countdownPercent }}%
        </span>
      </div>
    </div>

    <!-- 悬停浮层 -->
    <div
      v-if="hovered"
      class="wheel-tip"
      :style="{ left: `${hovered.x}px`, top: `${hovered.y}px` }"
    >
      <div class="tip-head">
        <span class="tip-dot" :style="{ background: hovered.arc.color }" />
        <span class="tip-name">{{ hovered.arc.name }}</span>
        <span v-if="hovered.arc.live" class="tip-live">进行中</span>
      </div>
      <div class="tip-time tabular">{{ hovered.arc.timeText }}</div>
      <div class="tip-meta">{{ hovered.arc.durationText }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import { arcPath, pointOnCircle, timeRangeToFractions } from '~~/shared/utils/arc'
import { colorForIndex } from '~~/shared/utils/color'
import {
  countdownEnd,
  dayKey,
  endOfDay,
  formatDuration,
  formatDurationParts,
  formatTime,
  fractionOfDay,
  netMs,
  splitByDay,
} from '~~/shared/utils/time'

const props = defineProps<{
  records: TimeRecord[]
  now: number
  active: TimeRecord | null
}>()

const emit = defineEmits<{
  (event: 'open', id: string): void
}>()

const CX = 320
const CY = 320
const R_OUT = 266
const R_IN = 212
const wrapper = ref<HTMLElement | null>(null)

const current = computed(() => props.now || Date.now())
const todayKey = computed(() => dayKey(current.value))
const dayStart = computed(() => new Date(current.value).setHours(0, 0, 0, 0))
const dayEnd = computed(() => endOfDay(current.value))
const dayProgress = computed(() => fractionOfDay(current.value, dayStart.value))

interface ArcItem {
  key: string
  recordId: string
  name: string
  color: string
  d: string
  live: boolean
  timeText: string
  durationText: string
  aria: string
}

const arcs = computed<ArcItem[]>(() => {
  const now = current.value
  const out: ArcItem[] = []
  for (const record of props.records) {
    if (record.deletedAt) continue
    const slices = splitByDay(record, now)
    for (const slice of slices) {
      if (slice.dayKey !== todayKey.value) continue
      const sliceDayEnd = endOfDay(slice.dayStart)
      slice.segments.forEach((seg, index) => {
        const end = seg.end ?? now
        const { f0, f1 } = timeRangeToFractions(seg.start, end, slice.dayStart, sliceDayEnd)
        const d = arcPath(CX, CY, R_OUT, R_IN, f0, f1, 2.6)
        if (!d) return
        const live =
          record.status === 'running' &&
          index === slice.segments.length - 1 &&
          record.segments.some((s) => s.end === null)
        const duration = Math.max(0, end - seg.start)
        out.push({
          key: `${record.id}-${slice.dayKey}-${index}`,
          recordId: record.id,
          name: record.name,
          color: colorForIndex(record.colorIndex),
          d,
          live,
          timeText: `${formatTime(seg.start)} – ${live ? '现在' : formatTime(end)}`,
          durationText: live ? `已进行 ${formatDuration(duration)}` : formatDuration(duration),
          aria: `${record.name}，${formatTime(seg.start)} 至 ${live ? '现在' : formatTime(end)}，${
            live ? '进行中' : formatDuration(duration)
          }`,
        })
      })
    }
  }
  return out
})

const tickPoints = computed(() => {
  const points: Record<number, { x1: number; y1: number; x2: number; y2: number }> = {}
  for (let hour = 1; hour <= 24; hour++) {
    const fraction = hour / 24
    const inner = pointOnCircle(CX, CY, R_IN - 2, fraction)
    const outer = pointOnCircle(CX, CY, R_IN - (hour % 6 === 0 ? 9 : 6), fraction)
    points[hour] = { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
  }
  return points
})

const hourLabels = computed(() =>
  [0, 6, 12, 18].map((hour) => {
    const p = pointOnCircle(CX, CY, 186, hour / 24)
    return { text: `${String(hour).padStart(2, '0')}`, x: p.x, y: p.y }
  }),
)

const pointer = computed(() => pointOnCircle(CX, CY, R_IN, dayProgress.value))

const activeColor = computed(() => (props.active ? colorForIndex(props.active.colorIndex) : ''))

const activeValue = computed(() => {
  const record = props.active
  if (!record) return ''
  if (record.mode === 'countdown' && record.targetMs) {
    const end = countdownEnd(record)
    const remaining = Math.max(0, (end ?? current.value) - current.value)
    return `剩余 ${formatDuration(remaining)}`
  }
  return formatDuration(netMs(record, current.value))
})

const countdown = computed(() => {
  const record = props.active
  if (!record || record.mode !== 'countdown' || !record.targetMs) return null
  const end = countdownEnd(record)
  if (!end) return null
  const remaining = Math.max(0, end - current.value)
  return { ratio: Math.min(1, remaining / record.targetMs), remaining }
})

const dayPercent = computed(() => Math.round(dayProgress.value * 100))
const countdownPercent = computed(() => Math.round((countdown.value?.ratio ?? 0) * 100))

const todaySegments = computed(() => {
  const now = current.value
  const segments: { start: number; end: number }[] = []
  for (const record of props.records) {
    if (record.deletedAt) continue
    for (const slice of splitByDay(record, now)) {
      if (slice.dayKey !== todayKey.value) continue
      for (const seg of slice.segments) {
        segments.push({ start: seg.start, end: seg.end ?? now })
      }
    }
  }
  return segments
})

const todayNet = computed(() =>
  todaySegments.value.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0),
)

const todayParts = computed(() => formatDurationParts(todayNet.value))
const todayMain = computed(() => todayParts.value.main)
const todayUnit = computed(() => todayParts.value.unit)
const todaySegmentCount = computed(() => todaySegments.value.length)

interface HoverState {
  arc: ArcItem
  x: number
  y: number
}

const hovered = ref<HoverState | null>(null)

function placeTooltip(event: PointerEvent) {
  const rect = wrapper.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  const maxX = Math.max(8, rect.width - 200)
  return {
    x: Math.min(Math.max(8, event.clientX - rect.left + 14), maxX),
    y: Math.max(8, event.clientY - rect.top - 8),
  }
}

function onEnter(arc: ArcItem, event: PointerEvent) {
  hovered.value = { arc, ...placeTooltip(event) }
}

function onMove(event: PointerEvent) {
  if (!hovered.value) return
  hovered.value = { arc: hovered.value.arc, ...placeTooltip(event) }
}

function onFocus(arc: ArcItem) {
  const rect = wrapper.value?.getBoundingClientRect()
  hovered.value = {
    arc,
    x: rect ? rect.width / 2 - 90 : 0,
    y: rect ? 24 : 0,
  }
}

function onLeave() {
  hovered.value = null
}
</script>

<style scoped>
.time-wheel {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  user-select: none;
}

.wheel-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.wheel-arc {
  cursor: pointer;
  outline: none;
}

.wheel-arc .arc-fill {
  transition: opacity 180ms ease-out;
}

.wheel-arc:not(.live):not(.focused) .arc-fill {
  opacity: 0.92;
}

.wheel-arc.focused .arc-fill,
.wheel-arc:focus-visible .arc-fill {
  opacity: 1;
}

.wheel-arc:focus-visible .arc-fill {
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 1.2;
}

.arc-glow {
  animation: arc-breathe 3.4s ease-in-out infinite;
}

@keyframes arc-breathe {
  0%,
  100% {
    opacity: 0.22;
  }
  50% {
    opacity: 0.48;
  }
}

@media (prefers-reduced-motion: reduce) {
  .arc-glow {
    animation: none;
    opacity: 0.3;
  }
}

.wheel-hour-label {
  fill: var(--m3e-text-3);
  font-size: 11px;
  font-family: var(--m3e-font);
  letter-spacing: 0.04em;
}

.ring-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* 原 640 视口内半径 178 小环，等比缩放到 356/640 */
.ring-inner {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 55.625%;
  height: 55.625%;
  transform: translate(-50%, -50%);
}

.wheel-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 46%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  text-align: center;
  pointer-events: none;
}

.center-label {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--m3e-text-3);
}

.center-total {
  display: flex;
  align-items: baseline;
  gap: 5px;
  line-height: 1;
}

.center-total strong {
  font-size: clamp(30px, 5.2vw, 48px);
  font-weight: 600;
  color: var(--m3e-text);
}

.center-total span {
  font-size: 12px;
  color: var(--m3e-text-2);
}

.center-active {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--m3e-surface-2);
  font-size: 11.5px;
  color: var(--m3e-text-2);
}

.center-dot,
.tip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.center-name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--m3e-text);
}

.center-meta {
  color: var(--m3e-text-3);
  white-space: nowrap;
}

.center-idle {
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.center-segments {
  font-size: 10.5px;
  color: var(--m3e-text-3);
  letter-spacing: 0.04em;
}

.center-rings {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
}

.ring-key {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--m3e-text-3);
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.ring-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ring-dot.outer {
  background: var(--m3e-text-3);
}

.ring-dot.inner {
  background: var(--m3e-accent);
}

.wheel-tip {
  position: absolute;
  z-index: 30;
  pointer-events: none;
  min-width: 150px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(31, 31, 34, 0.97);
  border: 1px solid var(--m3e-border-strong);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tip-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tip-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--m3e-text);
}

.tip-live {
  font-size: 10px;
  color: var(--m3e-accent);
  background: var(--m3e-accent-ghost);
  padding: 1px 6px;
  border-radius: 999px;
}

.tip-time {
  font-size: 11.5px;
  color: var(--m3e-text-2);
}

.tip-meta {
  font-size: 11px;
  color: var(--m3e-text-3);
}
</style>
