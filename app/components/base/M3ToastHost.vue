<template>
  <Teleport to="body">
    <div class="m3-toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="item in items" :key="item.id" class="m3-toast" :class="`tone-${item.tone}`">
          <span class="m3-toast-dot" />
          <span class="m3-toast-text">{{ item.message }}</span>
          <button type="button" class="m3-toast-close" aria-label="关闭提示" @click="dismiss(item.id)">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToasts } from '~/composables/useToasts'

const { items, dismiss } = useToasts()
</script>

<style scoped>
.m3-toast-host {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  width: min(560px, calc(100vw - 32px));
}

.m3-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 10px 11px 14px;
  border-radius: 12px;
  background: rgba(39, 39, 42, 0.96);
  border: 1px solid var(--m3e-border-strong);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36);
  max-width: 100%;
}

.m3-toast-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--m3e-accent);
  flex-shrink: 0;
}

.m3-toast-text {
  font-size: 12.5px;
  color: var(--m3e-text-2);
  line-height: 1.45;
}

.m3-toast-close {
  margin-left: 4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: var(--m3e-text-3);
  flex-shrink: 0;
}

.m3-toast-close:hover {
  background: var(--m3e-surface-3);
  color: var(--m3e-text);
}

.tone-danger .m3-toast-dot {
  background: var(--m3e-danger);
}

.tone-warn .m3-toast-dot {
  background: var(--m3e-warn);
}

.tone-success .m3-toast-dot {
  background: #a8d9a6;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
