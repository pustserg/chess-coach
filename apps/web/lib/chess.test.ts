import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { applyBotMove, applyMove, createInitialState, getLegalTargetSquares, getStatus, promote, undo, undoPlies } from './chess'

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

describe('captured pieces and special moves', () => {
  it('records a regular capture', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.captured.w).toEqual(['p'])
    expect(state.captured.b).toEqual([])
  })

  it('records an en passant capture', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['a7','a6'], ['e4','e5'], ['d7','d5'], ['e5','d6']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.captured.w).toEqual(['p'])
    expect(state.fen.split(' ')[3]).toBe('-') // no lingering en-passant square
  })

  it('castles kingside for white', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['e7','e5'], ['g1','f3'], ['g8','f6'], ['f1','e2'], ['f8','e7']] as const) {
      state = applyMove(state, f, t)
    }
    state = applyMove(state, 'e1', 'g1') // O-O
    expect(state.history.at(-1)).toBe('O-O')
  })
})

describe('promotion', () => {
  it('sets pendingPromotion when a pawn reaches the last rank', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5'], ['c7','c6'], ['d5','c6'], ['a7','a6'], ['c6','c7'], ['a6','a5'], ['c7','b8']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.pendingPromotion).toEqual({ from: 'c7', to: 'b8' })
  })

  it('commits the chosen promotion piece', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5'], ['c7','c6'], ['d5','c6'], ['a7','a6'], ['c6','c7'], ['a6','a5'], ['c7','b8']] as const) {
      state = applyMove(state, f, t)
    }
    state = promote(state, 'n')
    expect(state.pendingPromotion).toBeNull()
    expect(state.history.at(-1)).toBe('cxb8=N')
  })
})

describe('undo', () => {
  it('reverts the last move', () => {
    let state = createInitialState({ minutes: 5 })
    state = applyMove(state, 'e2', 'e4')
    state = applyMove(state, 'e7', 'e5')
    state = undo(state)
    expect(state.history).toEqual(['e4'])
    expect(state.turn).toBe('b')
  })

  it('is a no-op on the initial position', () => {
    const state = createInitialState({ minutes: 5 })
    expect(undo(state)).toBe(state)
  })

  it('un-records a captured piece when undoing a capture', () => {
    let state = createInitialState({ minutes: 5 })
    state = applyMove(state, 'e2', 'e4')
    state = applyMove(state, 'd7', 'd5')
    state = applyMove(state, 'e4', 'd5')
    expect(state.captured.w).toEqual(['p'])
    state = undo(state)
    expect(state.captured.w).toEqual([])
    expect(state.history).toEqual(['e4', 'd5'])
  })
})

describe('getLegalTargetSquares', () => {
  it('returns the legal targets for a square', () => {
    const fen = createInitialState({ minutes: 5 }).fen
    expect(getLegalTargetSquares(fen, 'e2')).toEqual(['e3', 'e4'])
    expect(getLegalTargetSquares(fen, 'a1')).toEqual([])
  })
})

describe('applyBotMove', () => {
  it('commits a plain UCI move', () => {
    const state = createInitialState({ minutes: 10 })
    const next = applyBotMove(state, 'e2e4')
    expect(next.history).toEqual(['e4'])
    expect(next.turn).toBe('b')
  })

  it('commits a capture and records the captured piece', () => {
    // Position after 1. e4 d5: white pawn e4 captures d5.
    const state = {
      ...createInitialState({ minutes: 10 }),
      fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    }
    const next = applyBotMove(state, 'e4d5')
    expect(next.history).toEqual(['exd5'])
    expect(next.captured.w).toEqual(['p'])
  })

  it('commits a promotion without setting pendingPromotion', () => {
    const state = {
      ...createInitialState({ minutes: 10 }),
      fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
    }
    const next = applyBotMove(state, 'a7a8q')
    expect(next.pendingPromotion).toBeNull()
    expect(next.history).toEqual(['a8=Q+'])
  })

  it('ignores a malformed UCI move', () => {
    const state = createInitialState({ minutes: 10 })
    expect(applyBotMove(state, 'e2')).toBe(state)
  })
})

describe('undoPlies', () => {
  it('reverts multiple plies', () => {
    let state = createInitialState({ minutes: 10 })
    state = applyMove(state, 'e2', 'e4')
    state = applyMove(state, 'e7', 'e5')
    state = applyMove(state, 'g1', 'f3')
    const next = undoPlies(state, 2)
    expect(next.history).toEqual(['e4'])
    expect(next.turn).toBe('b')
  })

  it('caps at the history length', () => {
    let state = createInitialState({ minutes: 10 })
    state = applyMove(state, 'e2', 'e4')
    const next = undoPlies(state, 5)
    expect(next.history).toEqual([])
    expect(next.turn).toBe('w')
  })
})
