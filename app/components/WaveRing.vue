<template>
  <div ref="root" class="wave-ring" :class="`tone-${tone}`">
    <m-progress
      class="wave-ring__progress"
      variant="circular"
      :value="percent"
      max="100"
      :shape="shape"
      :size="BASE_SIZE"
      :thickness="innerThickness"
      :aria-label="ariaLabel"
      :style="{ transform: `scale(${scale})` }"
    ></m-progress>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

/** mtrl 圆形进度画布上限 240px，以它为基准绘制后按容器尺寸等比放大 */
const BASE_SIZE = 240

const props = withDefaults(
  defineProps<{
    /** 0 – 1 的进度比例 */
    value: number
    /** 设计外径（px），用于换算线宽；实际按父容器等比缩放 */
    size?: number
    /** 设计线宽（px），按 size 等比换算 */
    thickness?: number
    /** 环形态：flat 为常规圆环，wavy 为波浪 */
    shape?: 'flat' | 'wavy'
    tone?: 'accent' | 'muted' | 'warn'
    ariaLabel?: string
  }>(),
  { size: 240, thickness: 9, shape: 'wavy', tone: 'accent', ariaLabel: '进度' },
)

const root = ref<HTMLElement | null>(null)
const scale = ref(1)
let observer: ResizeObserver | null = null

const clamped = computed(() => Math.min(1, Math.max(0, Number.isFinite(props.value) ? props.value : 0)))
const percent = computed(() => clamped.value * 100)

const innerThickness = computed(() => {
  const ratio = BASE_SIZE / Math.max(1, props.size)
  return Math.max(1.2, props.thickness * ratio)
})

onMounted(() => {
  const element = root.value
  if (!element) return
  const update = () => {
    scale.value = Math.max(0.1, element.clientWidth / BASE_SIZE)
  }
  update()
  observer = new ResizeObserver(update)
  observer.observe(element)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<style scoped>
.wave-ring {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wave-ring__progress {
  flex: none;
  transform-origin: center center;
}

.wave-ring.tone-muted {
  --mtrl-sys-color-primary: var(--m3e-text-3);
}

.wave-ring.tone-warn {
  --mtrl-sys-color-primary: var(--m3e-warn);
}

.wave-ring.tone-accent {
  --mtrl-sys-color-primary: var(--m3e-accent);
}
</style>
