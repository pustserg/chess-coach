import { describe, expect, it } from 'vitest'
import { createInitialState } from './chess'

describe('createInitialState', () => {
  it('returns the starting position with both clocks at the control', () => {
    const state = createInitialState({ minutes: 5 })
    expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(state.history).toEqual([])
    expect(state.captured).toEqual({ w: [], b: [] })
    expect(state.turn).toBe('w')
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.pendingPromotion).toBeNull()
  })
})
