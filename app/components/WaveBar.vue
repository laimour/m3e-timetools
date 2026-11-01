<template>
  <m-progress
    class="wave-bar"
    :class="`tone-${tone}`"
    variant="linear"
    :value="percent"
    max="100"
    shape="wavy"
    :thickness="mtrlThickness"
    :aria-label="ariaLabel"
  ></m-progress>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 0 – 1 的进度比例 */
    value: number
    /** 设计线宽（px）：< 7 用 mtrl 的 6，否则用 8 */
    thickness?: number
    tone?: 'accent' | 'muted' | 'warn'
    ariaLabel?: string
  }>(),
  { thickness: 8, tone: 'accent', ariaLabel: '进度' },
)

const clamped = computed(() => Math.min(1, Math.max(0, Number.isFinite(props.value) ? props.value : 0)))
const percent = computed(() => clamped.value * 100)
const mtrlThickness = computed(() => (props.thickness < 7 ? 6 : 8))
</script>

<style scoped>
/* mtrl 线性进度按宿主宽度绘制，必须显式块级 + 100% 宽度，否则塌陷 */
.wave-bar {
  display: block;
  width: 100%;
}

.wave-bar.tone-muted {
  --mtrl-sys-color-primary: var(--m3e-text-3);
}

.wave-bar.tone-warn {
  --mtrl-sys-color-primary: var(--m3e-warn);
}

.wave-bar.tone-accent {
  --mtrl-sys-color-primary: var(--m3e-accent);
}
</style>
