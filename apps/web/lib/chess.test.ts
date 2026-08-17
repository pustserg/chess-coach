import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getStatus } from './chess'

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

describe('getStatus', () => {
  it('detects checkmate (Fool\'s mate)', () => {
    const chess = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san)
    expect(getStatus(chess)).toBe('checkmate')
  })

  it('detects stalemate', () => {
    const chess = new Chess('k7/1R6/2K5/8/8/8/8/8 b - - 0 1')
    expect(getStatus(chess)).toBe('stalemate')
  })

  it('detects threefold repetition', () => {
    const chess = new Chess()
    for (let i = 0; i < 2; i++) {
      for (const san of ['Ng1f3', 'Ng8f6', 'Nf3g1', 'Nf6g8']) chess.move(san)
    }
    expect(getStatus(chess)).toBe('threefold-repetition')
  })

  it('detects insufficient material', () => {
    const chess = new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1')
    expect(getStatus(chess)).toBe('insufficient-material')
  })

  it('detects the fifty-move rule', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 100 1')
    expect(getStatus(chess)).toBe('fifty-move')
  })

  it('detects check', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/4K2r w - - 0 1')
    expect(getStatus(chess)).toBe('check')
  })

  it('returns playing for the starting position', () => {
    expect(getStatus(new Chess())).toBe('playing')
  })
})

describe('applyMove', () => {
  it('advances the position, history, and turn', () => {
    let state = createInitialState({ minutes: 5 })
    state = applyMove(state, 'e2', 'e4')
    expect(state.history).toEqual(['e4'])
    expect(state.turn).toBe('b')
    expect(state.fen.split(' ')[1]).toBe('b')
  })

  it('ignores an illegal move', () => {
    const state = createInitialState({ minutes: 5 })
    const next = applyMove(state, 'e2', 'e5')
    expect(next).toBe(state)
  })
})
