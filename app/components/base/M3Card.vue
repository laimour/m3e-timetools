<template>
  <section class="m3-card" :class="{ compact }">
    <header v-if="title || $slots.header" class="m3-card-head">
      <div class="m3-card-title">
        <slot name="icon" />
        <h2 v-if="title">{{ title }}</h2>
        <slot name="header" />
      </div>
      <div class="m3-card-action">
        <slot name="action" />
      </div>
    </header>
    <div class="m3-card-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    compact?: boolean
  }>(),
  { title: '', compact: false },
)
</script>

<style scoped>
.m3-card {
  background: var(--m3e-surface);
  border-radius: var(--m3e-radius-card);
  box-shadow: var(--m3e-shadow-card);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.m3-card.compact {
  padding: 18px;
  gap: 14px;
}

.m3-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.m3-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.m3-card-title h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--m3e-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.m3-card-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.m3-card-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
</style>
