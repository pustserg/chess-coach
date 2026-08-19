import { describe, expect, it } from 'vitest'
import { DIFFICULTY_PRESETS, resolveEngineOptions, sideToColor } from './types'
import type { GameConfig } from './types'

const base: GameConfig = {
  mode: 'vs-computer',
  side: 'white',
  difficulty: 'casual',
  custom: null,
}

describe('resolveEngineOptions', () => {
  it('returns the preset options when custom is null', () => {
    expect(resolveEngineOptions(base)).toBe(DIFFICULTY_PRESETS.casual)
  })

  it('returns custom options when set', () => {
    const config: GameConfig = { ...base, custom: { level: 3, depth: 4 } }
    expect(resolveEngineOptions(config)).toEqual({ level: 3, depth: 4 })
  })
})

describe('sideToColor', () => {
  it('maps white to w and black to b', () => {
    expect(sideToColor('white')).toBe('w')
    expect(sideToColor('black')).toBe('b')
  })
})

describe('DIFFICULTY_PRESETS', () => {
  it('covers all five presets with in-range level and depth', () => {
    expect(Object.keys(DIFFICULTY_PRESETS).sort()).toEqual(
      ['advanced', 'beginner', 'casual', 'expert', 'intermediate'].sort(),
    )
    for (const o of Object.values(DIFFICULTY_PRESETS)) {
      expect(o.level).toBeGreaterThanOrEqual(0)
      expect(o.level).toBeLessThanOrEqual(20)
      expect(o.depth).toBeGreaterThanOrEqual(1)
      expect(o.depth).toBeLessThanOrEqual(20)
    }
  })

  it('pins the exact level and depth for every preset', () => {
    expect(DIFFICULTY_PRESETS).toEqual({
      beginner: { level: 1, depth: 2 },
      casual: { level: 5, depth: 8 },
      intermediate: { level: 10, depth: 12 },
      advanced: { level: 15, depth: 16 },
      expert: { level: 20, depth: 20 },
    })
  })
})
