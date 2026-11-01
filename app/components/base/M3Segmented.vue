<template>
  <div class="m3-segmented" role="group">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="m3-segmented-item"
      :class="{ active: option.value === modelValue }"
      :aria-pressed="option.value === modelValue"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
}>()

defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<style scoped>
.m3-segmented {
  display: flex;
  gap: 3px;
  padding: 3px;
  background: var(--m3e-surface-2);
  border-radius: 12px;
}

.m3-segmented-item {
  flex: 1;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 12.5px;
  color: var(--m3e-text-3);
  transition: background-color 160ms ease-out, color 160ms ease-out;
  white-space: nowrap;
}

.m3-segmented-item:hover {
  color: var(--m3e-text-2);
}

.m3-segmented-item.active {
  background: var(--m3e-accent-dim);
  color: var(--m3e-accent);
}
</style>