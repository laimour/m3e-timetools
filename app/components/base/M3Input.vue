<template>
  <label class="m3-input">
    <span v-if="label" class="m3-input-label">
      {{ label }}
      <span v-if="optional" class="m3-input-optional">可选</span>
    </span>
    <input
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :min="min"
      :max="max"
      :step="step"
      :autofocus="autofocus"
      :inputmode="inputmode"
      autocomplete="off"
      @input="onInput"
      @keydown.enter="$emit('submit')"
    >
    <span v-if="hint" class="m3-input-hint">{{ hint }}</span>
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    type?: string
    placeholder?: string
    maxlength?: number
    min?: string | number
    max?: string | number
    step?: string | number
    hint?: string
    optional?: boolean
    autofocus?: boolean
    inputmode?: 'text' | 'numeric' | 'decimal'
  }>(),
  {
    label: '',
    type: 'text',
    placeholder: '',
    maxlength: undefined,
    min: undefined,
    max: undefined,
    step: undefined,
    hint: '',
    optional: false,
    autofocus: false,
    inputmode: undefined,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'submit'): void
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<style scoped>
.m3-input {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.m3-input-label {
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
}

.m3-input-optional {
  margin-left: 6px;
  color: var(--m3e-text-3);
  opacity: 0.75;
}

.m3-input input {
  width: 100%;
}

.m3-input-hint {
  font-size: 12px;
  color: var(--m3e-text-3);
}
</style>