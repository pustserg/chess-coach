import { DEFAULT_POSITION } from 'chess.js'
import type { GameState, TimeControl } from './types'

export function createInitialState(_timeControl: TimeControl): GameState {
  return {
    fen: DEFAULT_POSITION,
    history: [],
    captured: { w: [], b: [] },
    turn: 'w',
    status: 'playing',
    winner: null,
    pendingPromotion: null,
  }
}
