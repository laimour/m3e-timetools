<template>
  <span class="m3-tooltip" @mouseenter="show = true" @mouseleave="show = false">
    <button
      type="button"
      class="m3-tooltip-trigger"
      :aria-label="label"
      :aria-describedby="tooltipId"
      @focus="show = true"
      @blur="show = false"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12Zm0-9v.5m0 2.2v3.6"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <span v-if="show" :id="tooltipId" class="m3-tooltip-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'

withDefaults(
  defineProps<{
    text: string
    label?: string
  }>(),
  { label: '查看说明' },
)

const show = ref(false)
const tooltipId = `m3-tip-${useId()}`
</script>

<style scoped>
.m3-tooltip {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}

.m3-tooltip-trigger {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: var(--m3e-text-3);
  background: transparent;
  transition: color 160ms ease-out;
}

.m3-tooltip-trigger:hover,
.m3-tooltip-trigger:focus-visible {
  color: var(--m3e-text-2);
}

.m3-tooltip-bubble {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: 240px;
  padding: 9px 11px;
  border-radius: 10px;
  background: #1f1f22;
  border: 1px solid var(--m3e-border-strong);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--m3e-text-2);
  z-index: 40;
  pointer-events: none;
  white-space: normal;
}
</style>