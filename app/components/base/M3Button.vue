<template>
  <button
    class="m3-button"
    :class="[`variant-${variant}`, `size-${size}`, { block }]"
    :type="type"
    :disabled="disabled"
  >
    <slot name="icon" />
    <span v-if="$slots.default" class="m3-button-label"><slot /></span>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'solid' | 'subtle' | 'ghost' | 'danger'
    size?: 'md' | 'sm'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'subtle', size: 'md', block: false, disabled: false, type: 'button' },
)
</script>

<style scoped>
.m3-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: var(--m3e-radius-btn);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  padding: 11px 16px;
  transition: background-color 180ms ease-out, color 180ms ease-out, opacity 180ms ease-out;
  white-space: nowrap;
}

.m3-button.size-sm {
  padding: 7px 11px;
  font-size: 12px;
  border-radius: 9px;
}

.m3-button.block {
  width: 100%;
}

.m3-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.variant-primary {
  background: var(--m3e-accent-dim);
  color: var(--m3e-accent);
}

.variant-primary:hover:not(:disabled) {
  background: rgba(202, 191, 250, 0.22);
}

.variant-solid {
  background: var(--m3e-accent);
  color: #1a1a1d;
}

.variant-solid:hover:not(:disabled) {
  background: #d6cdfb;
}

.variant-subtle {
  background: var(--m3e-surface-2);
  color: var(--m3e-text-2);
}

.variant-subtle:hover:not(:disabled) {
  background: var(--m3e-surface-3);
  color: var(--m3e-text);
}

.variant-ghost {
  background: transparent;
  color: var(--m3e-text-3);
}

.variant-ghost:hover:not(:disabled) {
  background: var(--m3e-surface-2);
  color: var(--m3e-text-2);
}

.variant-danger {
  background: rgba(224, 162, 162, 0.12);
  color: var(--m3e-danger);
}

.variant-danger:hover:not(:disabled) {
  background: rgba(224, 162, 162, 0.18);
}

.m3-button-label {
  display: inline-block;
}
</style>