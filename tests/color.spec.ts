import { describe, expect, it } from 'vitest'
import {
  PALETTE,
  PALETTE_SIZE,
  colorForIndex,
  colorOf,
  ensureColor,
  hashName,
  normalizeName,
} from '../shared/utils/color'
import type { ColorRegistry } from '../shared/types'

/** 按名称顺序登记，返回最终注册表 */
function registerAll(names: string[], registry: ColorRegistry = {}): ColorRegistry {
  let current = registry
  for (const name of names) current = ensureColor(name, current).registry
  return current
}

describe('名称归一化 / 哈希', () => {
  it('大小写与首尾空格归一化后被视为同一名称', () => {
    expect(normalizeName('  深度工作 ')).toBe('深度工作')
    expect(normalizeName('Deep Work')).toBe('deep work')
  })

  it('同名同哈希，跨调用稳定且为非负 32 位整数', () => {
    const a = hashName('深度工作')
    const b = hashName('  深度工作 ')
    expect(a).toBe(b)
    expect(hashName('深度工作')).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(2 ** 32)
  })

  it('不同名称的哈希不要求唯一，但色点由注册表保证唯一', () => {
    const names = Array.from({ length: 200 }, (_, i) => `事件-${i}`)
    const registry = registerAll(names)
    const indexes = names.map((n) => registry[normalizeName(n)]!)
    expect(new Set(indexes).size).toBe(names.length)
  })
})

describe('ensureColor 注册表', () => {
  it('首次登记返回 isNew，再次登记直接复用', () => {
    const first = ensureColor('深度工作', {})
    expect(first.isNew).toBe(true)
    expect(first.registry[normalizeName('深度工作')]).toBe(first.colorIndex)

    const second = ensureColor('深度工作', first.registry)
    expect(second.isNew).toBe(false)
    expect(second.colorIndex).toBe(first.colorIndex)
    expect(second.registry).toBe(first.registry)
  })

  it('归一化后同名颜色一致', () => {
    const registry = registerAll(['写作', '  写作 ', 'WRITING', 'writing'])
    expect(new Set(Object.values(registry)).size).toBe(2)
    expect(ensureColor('WRITING', registry).colorIndex).toBe(registry['writing'])
  })

  it('200 个不同名称的索引与颜色值都不重复', () => {
    const names = Array.from({ length: 200 }, (_, i) => `名称${i}`)
    const registry = registerAll(names)
    const indexes = Object.values(registry)
    expect(indexes).toHaveLength(names.length)
    expect(new Set(indexes).size).toBe(names.length)
    const colors = indexes.map((i) => colorForIndex(i))
    expect(new Set(colors).size).toBe(names.length)
  })

  it('重建注册表后同一名称仍得到同一索引与颜色', () => {
    const names = ['阅读', '健身', '会议', '通勤', '睡眠']
    const first = registerAll(names)
    const second = registerAll(names)
    expect(second).toEqual(first)
    for (const name of names) {
      const key = normalizeName(name)
      expect(colorForIndex(second[key]!)).toBe(colorForIndex(first[key]!))
    }
  })

  it('已有注册表里重新登记不会改变既有映射', () => {
    const registry = registerAll(['甲', '乙', '丙'])
    const snapshot = { ...registry }
    const next = ensureColor('丁', registry).registry
    expect(next['甲']).toBe(snapshot['甲'])
    expect(next['乙']).toBe(snapshot['乙'])
    expect(next['丙']).toBe(snapshot['丙'])
  })
})

describe('colorForIndex 调色板', () => {
  it('前 16 个索引直接取自调色板且各不相同', () => {
    for (let i = 0; i < PALETTE_SIZE; i++) {
      expect(colorForIndex(i)).toBe(PALETTE[i])
    }
  })

  it('超出调色板后派生出新的十六进制颜色，且不再与调色板重复', () => {
    const derived = colorForIndex(PALETTE_SIZE)
    expect(derived).toMatch(/^#[0-9a-f]{6}$/)
    expect(PALETTE.includes(derived as (typeof PALETTE)[number])).toBe(false)
    expect(colorOf(PALETTE_SIZE)).toBe(derived)
  })

  it('负数与非法索引被安全归入调色板', () => {
    expect(colorForIndex(-1)).toBe(PALETTE[0])
    expect(colorForIndex(Number.NaN)).toBe(PALETTE[0])
  })
})