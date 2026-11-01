/**
 * 时间盘几何：极坐标换算与圆环扇区路径。
 * 0:00 在正上方（-90°），顺时针推进，24:00 回到顶部。
 */

export const TAU = Math.PI * 2

/** 归一化到 [0,1) */
export function clampFraction(f: number): number {
  if (!Number.isFinite(f)) return 0
  return Math.min(1, Math.max(0, f))
}

/** 占比 → 角度（度），0 在正上方 */
export function fractionToAngle(fraction: number): number {
  return clampFraction(fraction) * 360 - 90
}

/** 圆上一点 */
export function pointOnCircle(
  cx: number,
  cy: number,
  r: number,
  fraction: number,
): { x: number; y: number } {
  const angle = (fractionToAngle(fraction) * Math.PI) / 180
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

/** 满环路径（无缺口）：外圈顺时针 + 内圈逆时针 */
function fullRingPath(cx: number, cy: number, rOuter: number, rInner: number): string {
  return [
    `M ${cx + rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy}`,
    `A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy}`,
    `L ${cx + rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
    'Z',
  ].join(' ')
}

/**
 * 圆环扇区路径。
 * @param f0 起始占比 0–1
 * @param f1 结束占比 0–1
 * @param gapDeg 视觉间隙（度），在两端各内缩一半；极小片段会自适应缩小间隙
 */
export function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  f0: number,
  f1: number,
  gapDeg = 2.4,
): string {
  const start = clampFraction(Math.min(f0, f1))
  const end = clampFraction(Math.max(f0, f1))
  const span = end - start
  if (span <= 0.00001) return ''
  if (span >= 0.9999) return fullRingPath(cx, cy, rOuter, rInner)

  const gapEach = Math.min(gapDeg / 360 / 2, span * 0.25)
  const s = start + gapEach
  const e = end - gapEach
  if (e <= s) return ''

  const p1 = pointOnCircle(cx, cy, rOuter, s)
  const p2 = pointOnCircle(cx, cy, rOuter, e)
  const p3 = pointOnCircle(cx, cy, rInner, e)
  const p4 = pointOnCircle(cx, cy, rInner, s)
  const largeArc = e - s > 0.5 ? 1 : 0

  return [
    `M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `L ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(3)} ${p4.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

/** 起止时刻 → 当天占比（自动裁剪到当天 00:00–24:00） */
export function timeRangeToFractions(
  start: number,
  end: number,
  dayStart: number,
  dayEnd: number,
): { f0: number; f1: number } {
  const length = dayEnd - dayStart
  if (length <= 0) return { f0: 0, f1: 0 }
  const f0 = clampFraction((start - dayStart) / length)
  const f1 = clampFraction((end - dayStart) / length)
  return { f0, f1 }
}

/** 指针位置（角度以度计） */
export function pointerAt(cx: number, cy: number, r: number, fraction: number) {
  return pointOnCircle(cx, cy, r, fraction)
}

/** 由鼠标相对圆心的坐标反推占比（0 在正上方，顺时针） */
export function fractionFromPoint(cx: number, cy: number, x: number, y: number): number {
  const dx = x - cx
  const dy = y - cy
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  if (angle < 0) angle += 360
  return angle / 360
}
