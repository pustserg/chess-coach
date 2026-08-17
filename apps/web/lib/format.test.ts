import { describe, expect, it } from 'vitest'
import { formatClock } from './format'

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(5 * 60_000)).toBe('5:00')
    expect(formatClock(4 * 60_000 + 7_000)).toBe('4:07')
    expect(formatClock(59_000)).toBe('0:59')
    expect(formatClock(0)).toBe('0:00')
  })
})
