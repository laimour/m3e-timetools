<template>
  <div class="name-picker">
    <M3Input
      :model-value="modelValue"
      :label="label"
      :placeholder="placeholder"
      :maxlength="40"
      :autofocus="autofocus"
      @update:model-value="$emit('update:modelValue', $event)"
      @submit="$emit('submit')"
    />

    <div class="history">
      <span class="history-label">历史名称</span>
      <div v-if="history.length" class="history-list">
        <button
          v-for="item in history"
          :key="item.name"
          type="button"
          class="history-chip"
          :class="{ selected: item.name === modelValue }"
          :title="`使用 ${item.count} 次`"
          @click="$emit('update:modelValue', item.name)"
        >
          <span class="chip-dot" :style="{ background: colorForIndex(item.colorIndex) }" />
          <span class="chip-name">{{ item.name }}</span>
        </button>
      </div>
      <span v-else class="history-empty">首次使用会自动分配颜色，之后同名同色</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { colorForIndex } from '~~/shared/utils/color'
import type { NameHistoryItem } from '~/composables/useRecords'

withDefaults(
  defineProps<{
    modelValue: string
    history: NameHistoryItem[]
    label?: string
    placeholder?: string
    autofocus?: boolean
  }>(),
  { label: '名称', placeholder: '例如：深度工作', autofocus: false },
)

defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
}>()
</script>

<style scoped>
.name-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.history-label {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.history-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 116px;
  overflow-y: auto;
  padding-bottom: 2px;
}

.history-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--m3e-surface-2);
  color: var(--m3e-text-2);
  font-size: 11.5px;
  max-width: 100%;
  transition: background-color 160ms ease-out, color 160ms ease-out;
}

.history-chip:hover {
  background: var(--m3e-surface-3);
  color: var(--m3e-text);
}

.history-chip.selected {
  background: var(--m3e-accent-dim);
  color: var(--m3e-accent);
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-empty {
  font-size: 11px;
  color: var(--m3e-text-3);
}
</style>
