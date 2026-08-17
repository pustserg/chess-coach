import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { GameState, GameStatus, TimeControl } from './types'

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

export function getStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return 'checkmate'
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isThreefoldRepetition()) return 'threefold-repetition'
  if (chess.isInsufficientMaterial()) return 'insufficient-material'
  if (chess.isDrawByFiftyMoves()) return 'fifty-move'
  if (chess.inCheck()) return 'check'
  return 'playing'
}
