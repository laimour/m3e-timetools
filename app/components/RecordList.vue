<template>
  <M3Card title="今日记录">
    <template #action>
      <span class="record-count">{{ items.length }} 条</span>
    </template>

    <div v-if="items.length" class="record-list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="record-item"
        @click="$emit('open', item.id)"
      >
        <span class="record-dot" :style="{ background: item.color }" />
        <span class="record-main">
          <span class="record-top">
            <span class="record-name">{{ item.name }}</span>
            <span v-if="item.live" class="record-tag live">{{ item.statusText }}</span>
            <span v-if="item.interrupted" class="record-tag">中断</span>
            <span class="record-duration tabular">{{ item.durationText }}</span>
          </span>
          <span class="record-time tabular">{{ item.timeText }}</span>
          <span class="record-bar">
            <WaveBar
              :value="item.bar"
              :thickness="5"
              :tone="item.live ? 'accent' : 'muted'"
              :aria-label="`${item.name} 时长占比`"
            />
          </span>
        </span>
      </button>
    </div>

    <div v-else class="empty">今天还没有记录</div>
  </M3Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TimeRecord } from '~~/shared/types'
import { colorForIndex } from '~~/shared/utils/color'
import { isActive, formatDuration, formatTime, dayKey, splitByDay } from '~~/shared/utils/time'

const props = defineProps<{
  records: TimeRecord[]
  now: number
}>()

defineEmits<{
  (event: 'open', id: string): void
}>()

interface Item {
  id: string
  name: string
  color: string
  timeText: string
  durationText: string
  netMs: number
  bar: number
  live: boolean
  interrupted: boolean
  statusText: string
  startAt: number
}

const items = computed<Item[]>(() => {
  const now = props.now || Date.now()
  const today = dayKey(now)
  const list: Omit<Item, 'bar'>[] = []

  for (const record of props.records) {
    if (record.deletedAt) continue
    const slice = splitByDay(record, now).find((s) => s.dayKey === today)
    if (!slice) continue
    const net = slice.segments.reduce((sum, seg) => sum + ((seg.end ?? now) - seg.start), 0)
    const live = isActive(record)
    list.push({
      id: record.id,
      name: record.name,
      color: colorForIndex(record.colorIndex),
      timeText: `${formatTime(slice.start)} – ${live ? '现在' : formatTime(slice.end ?? now)}`,
      durationText: formatDuration(net),
      netMs: net,
      live,
      interrupted: record.interrupted,
      statusText: record.status === 'paused' ? '已暂停' : '进行中',
      startAt: slice.start,
    })
  }

  const max = Math.max(0, ...list.map((item) => item.netMs))
  return list
    .sort((a, b) => b.startAt - a.startAt)
    .map((item) => ({ ...item, bar: max > 0 ? item.netMs / max : 0 }))
})
</script>

<style scoped>
.record-count {
  font-size: 11px;
  color: var(--m3e-text-3);
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
}

.record-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 12px;
  text-align: left;
  transition: background-color 160ms ease-out;
}

.record-item:hover {
  background: var(--m3e-surface-2);
}

.record-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.record-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.record-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.record-name {
  font-size: 12.5px;
  color: var(--m3e-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-tag {
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--m3e-text-3);
  background: var(--m3e-surface-2);
  flex-shrink: 0;
}

.record-tag.live {
  color: var(--m3e-accent);
  background: var(--m3e-accent-ghost);
}

.record-duration {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--m3e-text-2);
  flex-shrink: 0;
}

.record-time {
  font-size: 10.5px;
  color: var(--m3e-text-3);
}

.record-bar {
  display: block;
  padding-top: 1px;
}

.empty {
  font-size: 12px;
  color: var(--m3e-text-3);
  padding: 6px 0 10px;
}
</style>
