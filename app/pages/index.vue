<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="logo">m3e</span>
        <span class="brand-divider" />
        <span class="brand-sub">一天时间盘</span>
      </div>

      <div class="today" aria-live="polite">
        <span v-if="ready" class="today-text">{{ todayLabel }}</span>
        <span v-else class="today-text placeholder">加载中</span>
      </div>

      <div ref="exportWrap" class="export">
        <M3Button variant="ghost" size="sm" @click="exportOpen = !exportOpen">
          <template #icon>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2.5v7M5.2 6.8L8 9.6l2.8-2.8M3 11.5v1.5h10v-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
            </svg>
          </template>
          导出
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </M3Button>
        <div v-if="exportOpen" class="export-menu">
          <button type="button" class="export-item" @click="download('json')">
            <span class="export-name">导出 JSON</span>
            <span class="export-hint">全量数据，含修改痕迹</span>
          </button>
          <button type="button" class="export-item" @click="download('csv')">
            <span class="export-name">导出 CSV</span>
            <span class="export-hint">UTF-8 BOM，Excel 可直接打开</span>
          </button>
        </div>
      </div>
    </header>

    <div v-if="!ready" class="skeleton">
      <div class="skeleton-col">
        <div class="skeleton-card" style="height: 210px" />
        <div class="skeleton-card" style="height: 260px" />
      </div>
      <div class="skeleton-card skeleton-wheel" />
      <div class="skeleton-col">
        <div class="skeleton-card" style="height: 128px" />
        <div class="skeleton-card" style="height: 128px" />
        <div class="skeleton-card" style="height: 128px" />
      </div>
    </div>

    <div v-else-if="loadError" class="load-error">
      <span>{{ loadError }}</span>
      <M3Button variant="primary" size="sm" @click="load">重试</M3Button>
    </div>

    <main v-else class="layout">
      <section class="area-timer">
        <TimerPanel
          :active="activeRecord"
          :now="now"
          :history="nameHistory"
          :notice="timer.expiredNotice.value"
          :pending-resume="pendingResume"
          @start="handleStart"
          @pause="handlePause"
          @resume="handleResume"
          @stop="handleStop"
          @manual="handleManual"
          @resume-prompt="resumeOpen = true"
          @dismiss-notice="timer.clearNotice"
        />
      </section>

      <section class="area-main">
        <TimeWheel
          :records="records"
          :now="now"
          :active="activeRecord"
          @open="openRecord"
        />
      </section>

      <section class="area-stats">
        <StatsPanel :records="records" :now="now" />
      </section>

      <section class="area-records">
        <RecordList :records="records" :now="now" @open="openRecord" />
      </section>
    </main>

    <footer class="foot">数据仅保存在本机，无账号、无云同步</footer>

    <RecordDetailModal
      v-model="detailOpen"
      :record="detailRecord"
      :now="now"
      @save="handleSave"
      @delete="handleDelete"
    />

    <ResumePrompt
      v-model="resumeOpen"
      :record="activeRecord"
      :now="now"
      @resolve="resolveResume"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { UpdateRecordPayload } from '~~/shared/types'
import { countdownEnd } from '~~/shared/utils/time'
import { useClock } from '~/composables/useClock'
import { useRecords } from '~/composables/useRecords'
import { useTimer } from '~/composables/useTimer'
import { useExport } from '~/composables/useExport'
import { useToasts } from '~/composables/useToasts'

const { now } = useClock()
const {
  records,
  ready,
  loadError,
  activeRecord,
  nameHistory,
  load,
  patchRecord,
  deleteRecord,
} = useRecords()
const timer = useTimer()
const { download } = useExport()
const { push } = useToasts()

const pendingResume = ref(false)
const resumeOpen = ref(false)
const detailOpen = ref(false)
const detailId = ref<string | null>(null)
const exportOpen = ref(false)
const exportWrap = ref<HTMLElement | null>(null)

const nowValue = computed(() => now.value || Date.now())

const todayLabel = computed(() => {
  const d = new Date(nowValue.value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(d)
})

const detailRecord = computed(() => records.value.find((record) => record.id === detailId.value) ?? null)

onMounted(async () => {
  await load()
  if (activeRecord.value) {
    pendingResume.value = true
    resumeOpen.value = true
  }
  document.addEventListener('mousedown', handleOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleOutside)
})

watch(now, (value) => {
  if (!ready.value || !value || pendingResume.value) return
  void timer.checkExpired(value)
})

function handleOutside(event: MouseEvent) {
  if (!exportWrap.value) return
  if (!exportWrap.value.contains(event.target as Node)) exportOpen.value = false
}

function handleStart(payload: { name: string; mode: 'countup' | 'countdown'; targetMs: number | null }) {
  pendingResume.value = false
  resumeOpen.value = false
  void timer.start(payload)
}

function handlePause() {
  pendingResume.value = false
  void timer.pause()
}

function handleResume() {
  pendingResume.value = false
  void timer.resume()
}

function handleStop() {
  pendingResume.value = false
  void timer.stop()
}

async function handleManual(payload: { name: string; start: number; end: number; note: string }) {
  await timer.createManual(payload)
  push(`已补记「${payload.name}」`, 'success', 3000)
}

async function resolveResume(payload: { action: 'now' | 'estimated' | 'at' | 'continue'; at?: number }) {
  const record = activeRecord.value
  pendingResume.value = false
  resumeOpen.value = false
  if (!record) return

  if (payload.action === 'continue') {
    await timer.continueTiming()
    return
  }

  let at = payload.at ?? nowValue.value
  if (payload.action === 'estimated') {
    at = countdownEnd(record) ?? at
  }
  await timer.endRecordAt(record, at)
}

function openRecord(id: string) {
  detailId.value = id
  detailOpen.value = true
}

async function handleSave(payload: UpdateRecordPayload) {
  if (!detailId.value) return
  const updated = await patchRecord(detailId.value, payload)
  if (updated) {
    detailOpen.value = false
    push('已保存修改', 'success', 2600)
  }
}

async function handleDelete(id: string) {
  const ok = await deleteRecord(id)
  if (ok) {
    detailOpen.value = false
    push('已删除记录', 'info', 2600)
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 22px 28px 36px;
  background:
    radial-gradient(1100px 520px at 50% -12%, rgba(202, 191, 250, 0.055), transparent 68%),
    var(--m3e-bg);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: 1480px;
  margin: 0 auto 22px;
  padding: 0 4px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--m3e-text);
}

.brand-divider {
  width: 1px;
  height: 14px;
  background: var(--m3e-border-strong);
}

.brand-sub {
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--m3e-text-3);
  white-space: nowrap;
}

.today {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--m3e-text-3);
  letter-spacing: 0.04em;
}

.today-text.placeholder {
  opacity: 0.6;
}

.export {
  position: relative;
  flex-shrink: 0;
}

.export-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 50;
  width: 210px;
  padding: 5px;
  border-radius: 13px;
  background: #212124;
  border: 1px solid var(--m3e-border-strong);
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 9px;
  text-align: left;
  transition: background-color 160ms ease-out;
}

.export-item:hover {
  background: var(--m3e-surface-3);
}

.export-name {
  font-size: 12px;
  color: var(--m3e-text);
}

.export-hint {
  font-size: 10.5px;
  color: var(--m3e-text-3);
}

.layout {
  max-width: 1480px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(340px, 380px) minmax(460px, 1fr) minmax(380px, 430px);
  grid-template-areas:
    'timer main stats'
    'records main stats';
  grid-template-rows: auto 1fr;
  gap: 18px;
  align-items: start;
}

.area-timer {
  grid-area: timer;
  min-width: 0;
}

.area-main {
  grid-area: main;
  min-width: 0;
  align-self: start;
}

.area-stats {
  grid-area: stats;
  min-width: 0;
}

.area-records {
  grid-area: records;
  min-width: 0;
}

.foot {
  max-width: 1480px;
  margin: 26px auto 0;
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: var(--m3e-text-3);
  opacity: 0.75;
}

.load-error {
  max-width: 420px;
  margin: 60px auto;
  padding: 20px;
  border-radius: 16px;
  background: var(--m3e-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  font-size: 12.5px;
  color: var(--m3e-text-2);
}

.skeleton {
  max-width: 1480px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(340px, 380px) minmax(460px, 1fr) minmax(380px, 430px);
  gap: 18px;
}

.skeleton-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-card {
  border-radius: var(--m3e-radius-card);
  background: var(--m3e-surface);
  opacity: 0.35;
}

.skeleton-wheel {
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  max-width: 720px;
}

@media (max-width: 1199px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'main'
      'timer'
      'stats'
      'records';
    grid-template-rows: auto;
  }

  .area-main {
    max-width: 640px;
    width: 100%;
    margin: 0 auto;
  }

  .area-timer,
  .area-stats,
  .area-records {
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
  }

  .skeleton {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .page {
    padding: 16px 14px 28px;
  }

  .topbar {
    gap: 10px;
  }

  .brand-divider,
  .brand-sub {
    display: none;
  }

  .today {
    text-align: right;
    font-size: 11px;
  }

  .today-text {
    white-space: nowrap;
  }
}
</style>