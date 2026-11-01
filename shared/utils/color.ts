/**
 * 事件颜色：固定 16 色低饱和调色板 + 名称注册表。
 * 同名同色、跨天稳定；调色板用尽后按明度派生新索引，避免不同名称共用同一色。
 */
import type { ColorRegistry } from '../types'

/** 16 色事件调色板（低饱和、深底可辨） */
export const PALETTE = [
  '#c7b8f8', '#a9b8f5', '#9fd0e8', '#8fd8c8', '#a8d9a6', '#d3d69b', '#e3c79a', '#e2b49b',
  '#e4aebb', '#d8a8d8', '#b9a7d9', '#98a7c9', '#8fb8b3', '#c2c08f', '#cf9f9f', '#a6a6b8',
] as const

export const PALETTE_SIZE = PALETTE.length

/** 名称归一化：trim + 小写（展示仍用用户原始写法） */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** FNV-1a 32 位哈希，结果非负 */
export function hashName(name: string): number {
  const text = normalizeName(name)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60
  else if (max === gg) h = ((bb - rr) / d + 2) * 60
  else h = ((rr - gg) / d + 4) * 60
  return [h, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360 / 360
  const ss = Math.min(1, Math.max(0, s))
  const ll = Math.min(1, Math.max(0, l))
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const channel = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(channel(hh + 1 / 3) * 255)
  const g = Math.round(channel(hh) * 255)
  const b = Math.round(channel(hh - 1 / 3) * 255)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * 索引 → 颜色。0–15 为原始调色板，之后按「明度 + 微色相」派生，
 * 保证名称数量超过 16 时仍无重复色值。
 */
export function colorForIndex(index: number): string {
  const safe = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
  const base = PALETTE[safe % PALETTE_SIZE]!
  const round = Math.floor(safe / PALETTE_SIZE)
  if (round === 0) return base

  const [r, g, b] = hexToRgb(base)
  const [h, s, l] = rgbToHsl(r, g, b)
  // 每轮固定偏移 22° 色相（前 16 轮内不会绕回同一色相），
  // 同时按轮次上下微调明度，避免相邻轮次看起来一样。
  const hue = h + round * 22
  const step = Math.ceil(round / 2)
  const dir = round % 2 === 0 ? -1 : 1
  const lightness = Math.min(0.9, Math.max(0.4, l + dir * step * 0.055))
  const sat = Math.min(0.85, s + 0.04)
  return hslToHex(hue, sat, lightness)
}

/**
 * 为名称登记颜色索引（不修改原注册表，返回新对象）。
 * 首次出现：hash 取模 16 起步，线性探测到未被占用的索引。
 */
export function ensureColor(
  name: string,
  registry: ColorRegistry,
): { colorIndex: number; registry: ColorRegistry; isNew: boolean } {
  const key = normalizeName(name)
  const existing = registry[key]
  if (typeof existing === 'number') {
    return { colorIndex: existing, registry, isNew: false }
  }

  const used = new Set(Object.values(registry))
  let index = hashName(name) % PALETTE_SIZE
  let guard = 0
  while (used.has(index)) {
    index += 1
    guard += 1
    if (guard > 4096) break
  }

  return {
    colorIndex: index,
    registry: { ...registry, [key]: index },
    isNew: true,
  }
}

/** 记录颜色：优先使用记录自带索引 */
export function colorOf(colorIndex: number): string {
  return colorForIndex(colorIndex)
}