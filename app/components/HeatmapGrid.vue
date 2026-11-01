<template>
  <div class="heatmap">
    <template v-if="mode === 'hour'">
      <div class="hour-grid" role="img" :aria-label="hourAria">
        <span
          v-for="cell in hourCells"
          :key="cell.hour"
          class="cell hour-cell"
          :style="{ background: `var(--m3e-heat-${cell.level})` }"
          :title="cell.title"
        />
      </div>
      <div class="hour-labels">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </template>

    <template v-else>
      <div class="month-head">
        <span>{{ monthTitle }}</span>
        <span class="month-total">{{ monthTotalText }}</span>
      </div>
      <div class="month-grid">
        <div v-for="(week, wi) in weeks" :key="wi" class="week-row">
          <span
            v-for="(cell, ci) in week"
            :key="`${wi}-${ci}`"
            class="cell month-cell"
            :class="{ blank: !cell.dayKey }"
            :style="{ background: cell.dayKey ? `var(--m3e-heat-${cell.level})` : 'transparent' }"
            :title="cell.title"
          />
        </div>
      </div>
      <div class="month-foot">
        <div class="weekdays">
          <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
        </div>
        <div class="legend">
          <span>少</span>
          <span v-for="level in 5" :key="level" class="cell legend-cell" :style="{ background: `var(--m3e-heat-${level})` }" />
          <span>多</span>
        </div>
      </div>
    </template>

    <div v-if="mode === 'hour' && legendVisible" class="legend hour-legend">
      <span>少</span>
      <span v-for="level in 5" :key="level" class="cell legend-cell" :style="{ background: `var(--m3e-heat-${level})` }" />
      <span>多</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import {
  dailyNetMap,
  heatLevel,
  hourlyBuckets,
  monthGrid,
} from '~~/shared/utils/stats'
import { dayKey, formatDuration } from '~~/shared/utils/time'

const props = withDefaults(
  defineProps<{
    mode: 'hour' | 'month'
    records: TimeRecord[]
    now: number
    legendVisible?: boolean
  }>(),
  { legendVisible: true },
)

const nowValue = computed(() => props.now || Date.now())

const hourValues = computed(() => hourlyBuckets(props.records, nowValue.value))
const hourMax = computed(() => Math.max(0, ...hourValues.value))

const hourCells = computed(() =>
  hourValues.value.map((ms, hour) => ({
    hour,
    level: heatLevel(ms, hourMax.value),
    title: `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00 · ${
      ms > 0 ? formatDuration(ms) : '无记录'
    }`,
  })),
)

const hourAria = computed(
  () => `今日按小时热力图，共 24 格，最长一小时 ${formatDuration(hourMax.value)}`,
)

const netMap = computed(() => dailyNetMap(props.records, nowValue.value))

const monthCells = computed(() => {
  const max = Math.max(0, ...netMap.value.values())
  return monthGrid(nowValue.value, netMap.value).map((week) =>
    week.map((cell) => {
      if (!cell.dayKey) {
        return { dayKey: null, level: 0, title: '', ms: 0 }
      }
      const d = new Date(`${cell.dayKey}T00:00:00`)
      return {
        dayKey: cell.dayKey,
        level: heatLevel(cell.ms, max),
        ms: cell.ms,
        title: `${d.getMonth() + 1}月${d.getDate()}日 · ${cell.ms > 0 ? formatDuration(cell.ms) : '无记录'}`,
      }
    }),
  )
})

const weeks = computed(() => monthCells.value)

const monthTitle = computed(() => {
  const d = new Date(nowValue.value)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
})

const monthTotalText = computed(() => {
  const currentMonth = dayKey(nowValue.value).slice(0, 7)
  let total = 0
  for (const [key, value] of netMap.value.entries()) {
    if (key.startsWith(currentMonth)) total += value
  }
  return `累计 ${formatDuration(total)}`
})

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']
</script>

<style scoped>
.heatmap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hour-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 3px;
}

.hour-cell {
  aspect-ratio: 1 / 1;
  border-radius: 4px;
  min-height: 10px;
}

.hour-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9.5px;
  color: var(--m3e-text-3);
  font-variant-numeric: tabular-nums;
  padding: 0 1px;
}

.month-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.month-head span:first-child {
  font-size: 11px;
  color: var(--m3e-text-3);
}

.month-total {
  font-size: 10.5px;
  color: var(--m3e-text-3);
}

.month-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: fit-content;
}

.week-row {
  display: grid;
  grid-template-columns: repeat(7, 24px);
  gap: 5px;
}

.month-cell {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}

.month-cell.blank {
  background: transparent !important;
}

.month-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  max-width: 210px;
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 24px);
  gap: 5px;
  font-size: 9.5px;
  color: var(--m3e-text-3);
  text-align: center;
}

.legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  color: var(--m3e-text-3);
}

.legend-cell {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.hour-legend {
  align-self: flex-end;
}
</style>
