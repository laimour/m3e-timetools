<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="m3-modal-overlay" @mousedown.self="close">
        <div
          class="m3-modal"
          :style="{ width }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="m3-modal-head">
            <h2>{{ title }}</h2>
            <button type="button" class="m3-modal-close" aria-label="关闭" @click="close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
            </button>
          </header>
          <div class="m3-modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="m3-modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
  }>(),
  { title: '', width: '520px' },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

let previousOverflow = ''

function close() {
  emit('update:modelValue', false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) close()
}

function syncBodyLock(open: boolean) {
  if (typeof document === 'undefined') return
  if (open) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = previousOverflow
  }
}

watch(
  () => props.modelValue,
  (open) => syncBodyLock(open),
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.modelValue) syncBodyLock(true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = previousOverflow
})
</script>

<style scoped>
.m3-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(10, 10, 12, 0.62);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.m3-modal {
  max-width: 100%;
  max-height: 86vh;
  overflow: auto;
  background: var(--m3e-surface);
  border-radius: 20px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}

.m3-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 8px;
}

.m3-modal-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--m3e-text);
}

.m3-modal-close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--m3e-text-3);
  transition: background-color 160ms ease-out, color 160ms ease-out;
}

.m3-modal-close:hover {
  background: var(--m3e-surface-2);
  color: var(--m3e-text);
}

.m3-modal-body {
  padding: 12px 24px 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.m3-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease-out;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .m3-modal,
.modal-leave-active .m3-modal {
  transition: transform 180ms ease-out;
}

.modal-enter-from .m3-modal,
.modal-leave-to .m3-modal {
  transform: translateY(8px) scale(0.99);
}
</style>
