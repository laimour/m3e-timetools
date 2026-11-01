<template>
  <div class="stats-panel">
    <div v-for="card in cards" :key="card.key" class="stat-card">
      <div class="stat-head">
        <span class="stat-icon" aria-hidden="true">
          <svg v-if="card.icon === 'today'" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="5.4" stroke="currentColor" stroke-width="1.2" />
            <path d="M8 5.2V8l2 1.3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <svg v-else-if="card.icon === 'week'" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2.5" y="3.5" width="11" height="10" rx="2" stroke="currentColor" stroke-width="1.2" />
            <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2.5 12.5l3.5-4 3 2 3.5-4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            <path d="M2.5 13.5h11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </span>
        <span class="stat-title">{{ card.title }}</span>
        <span class="stat-peak">峰值 {{ formatDuration(card.summary.peakMs) }}</span>
      </div>
      <div class="stat-big tabular">
        <strong>{{ card.parts.main }}</strong>
        <span>{{ card.parts.unit }}</span>
      </div>
      <span class="stat-aux">{{ card.aux }}</span>
    </div>

    <M3Card title="今日热力图" compact>
      <HeatmapGrid mode="hour" :records="records" :now="now" />
    </M3Card>

    <M3Card title="本月热力图" compact>
      <HeatmapGrid mode="month" :records="records" :now="now" />
    </M3Card>

    <M3Card title="今日统计口径" compact>
      <div class="metric">
        <div class="metric-head">
          <span class="metric-label">
            有效 / 总时长
            <M3Tooltip :text="effectiveTip" />
          </span>
          <span class="metric-value tabular">
            {{ formatDuration(todaySummary.netMs) }} / {{ formatDuration(todaySummary.spanMs) }}
          </span>
        </div>
        <WaveBar :value="effectiveRatio" :thickness="6" tone="muted" aria-label="有效时长占跨度比例" />
        <span class="metric-hint">有效占跨度 {{ percent(effectiveRatio) }}，暂停间隙只计入总时长</span>
      </div>

      <div class="metric">
        <div class="metric-head">
          <span class="metric-label">
            碎片率
            <M3Tooltip :text="fragmentTip" />
          </span>
          <span class="metric-value tabular">{{ fragmentation.fragmentCount }} / {{ fragmentation.segmentCount }} 段</span>
        </div>
        <div class="metric-hint two-line">
          <span>段数占比 {{ percent(fragmentation.countRatio) }}</span>
          <span>时长占比 {{ percent(fragmentation.msRatio) }}</span>
        </div>
      </div>
    </M3Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import {
  dayStats,
  fragmentationInRange,
  percent,
  streak,
  summarizeRange,
} from '~~/shared/utils/stats'
import {
  dayKey,
  endOfDay,
  formatDuration,
  formatDurationParts,
  monthRange,
  parseDayKey,
  startOfDay,
  weekRange,
} from '~~/shared/utils/time'

const props = defineProps<{
  records: TimeRecord[]
  now: number
}>()

const nowValue = computed(() => props.now || Date.now())

const allDays = computed(() => dayStats(props.records, nowValue.value))
const allActiveDays = computed(() => allDays.value.filter((d) => d.netMs > 0).length)
const allStreak = computed(() =>
  streak(
    allDays.value.filter((d) => d.netMs > 0).map((d) => d.dayKey),
    dayKey(nowValue.value),
  ),
)

const todayStart = computed(() => startOfDay(nowValue.value))
const todayEnd = computed(() => endOfDay(nowValue.value))
const thisWeek = computed(() => weekRange(nowValue.value))
const thisMonth = computed(() => monthRange(nowValue.value))

const todaySummary = computed(() =>
  summarizeRange(props.records, todayStart.value, todayEnd.value, nowValue.value),
)
const weekSummary = computed(() =>
  summarizeRange(props.records, thisWeek.value.start, thisWeek.value.end, nowValue.value),
)
const monthSummary = computed(() =>
  summarizeRange(props.records, thisMonth.value.start, thisMonth.value.end, nowValue.value),
)

function peakDate(key: string | null): string {
  if (!key) return '—'
  const d = new Date(parseDayKey(key))
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const cards = computed(() => [
  {
    key: 'today',
    icon: 'today',
    title: '今日',
    summary: todaySummary.value,
    parts: formatDurationParts(todaySummary.value.netMs),
    aux: `累计 ${allActiveDays.value} 天 · 连续 ${allStreak.value} 天`,
  },
  {
    key: 'week',
    icon: 'week',
    title: '本周',
    summary: weekSummary.value,
    parts: formatDurationParts(weekSummary.value.netMs),
    aux: `本周 ${weekSummary.value.activeDays} 天 · 峰值 ${peakDate(weekSummary.value.peakDayKey)}`,
  },
  {
    key: 'month',
    icon: 'month',
    title: '本月',
    summary: monthSummary.value,
    parts: formatDurationParts(monthSummary.value.netMs),
    aux: `本月 ${monthSummary.value.activeDays} 天 · 连续 ${monthSummary.value.streak} 天`,
  },
])

const effectiveRatio = computed(() => {
  const span = todaySummary.value.spanMs
  if (span <= 0) return 0
  return Math.min(1, todaySummary.value.netMs / span)
})

const fragmentation = computed(() =>
  fragmentationInRange(props.records, todayStart.value, todayEnd.value, nowValue.value),
)

const effectiveTip =
  '有效时长 = 所有分段净时长之和，不含暂停间隙；总时长 = 首段开始 → 末段结束的跨度，含暂停间隙，按当天裁剪。带「中断」标记的记录净时长仍计入有效。'

const fragmentTip =
  '单段净时长小于 5 分钟记为碎片（恰好 5 分钟不算）。段数占比 = 碎片段数 / 总段数，时长占比 = 碎片时长 / 总净时长。'
</script>

<style scoped>
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.stat-card {
  background: var(--m3e-surface);
  border-radius: var(--m3e-radius-card);
  box-shadow: var(--m3e-shadow-card);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  color: var(--m3e-text-2);
  display: inline-flex;
}

.stat-title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--m3e-text-2);
}

.stat-peak {
  margin-left: auto;
  font-size: 11px;
  color: var(--m3e-text-3);
  white-space: nowrap;
}

.stat-big {
  display: flex;
  align-items: baseline;
  gap: 5px;
  line-height: 1;
}

.stat-big strong {
  font-size: 48px;
  font-weight: 600;
  color: var(--m3e-text);
}

.stat-big span {
  font-size: 13px;
  color: var(--m3e-text-2);
}

.stat-aux {
  font-size: 11.5px;
  color: var(--m3e-text-3);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metric + .metric {
  padding-top: 12px;
  border-top: 1px solid var(--m3e-border);
}

.metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.metric-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: var(--m3e-text-2);
}

.metric-value {
  font-size: 12px;
  color: var(--m3e-text);
  white-space: nowrap;
}

.metric-hint {
  font-size: 10.5px;
  color: var(--m3e-text-3);
}

.metric-hint.two-line {
  display: flex;
  gap: 14px;
}
</style>
