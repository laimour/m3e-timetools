/**
 * 全局时钟：全站只用一个 setInterval，页面隐藏时暂停，恢复可见时立即重算。
 */
import { onMounted, onUnmounted, ref } from 'vue'

const now = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0
const isClient = () => typeof window !== 'undefined'

function tick() {
  now.value = Date.now()
}

function startTimer() {
  if (!isClient() || timer) return
  tick()
  timer = setInterval(tick, 1000)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function handleVisibility() {
  if (document.hidden) {
    stopTimer()
  } else if (subscribers > 0) {
    tick()
    startTimer()
  }
}

if (isClient()) {
  document.addEventListener('visibilitychange', handleVisibility)
}

export function useClock() {
  onMounted(() => {
    subscribers += 1
    tick()
    startTimer()
  })
  onUnmounted(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0) stopTimer()
  })
  return { now }
}

/** 手动立即刷新（弹窗提交等场景） */
export function refreshNow() {
  now.value = Date.now()
}
