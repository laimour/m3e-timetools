/**
 * 轻量提示：顶部 toast 队列，用于保存失败、倒计时结束等反馈。
 */
import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warn' | 'danger'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  duration: number
}

const items = ref<ToastItem[]>([])
let seq = 0

export function useToasts() {
  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id)
  }

  function push(message: string, tone: ToastTone = 'info', duration = 3600) {
    const id = ++seq
    items.value = [...items.value, { id, message, tone, duration }]
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  return { items, push, dismiss }
}
