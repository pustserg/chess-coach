import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { GameState, GameStatus, PromotionPiece, TimeControl } from './types'

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

interface CommittedMove {
  color: 'w' | 'b'
  san: string
  captured?: string
}

export function applyMove(state: GameState, from: string, to: string): GameState {
  const chess = new Chess(state.fen)
  const candidates = chess
    .moves({ square: from as never, verbose: true })
    .filter((m) => m.to === to)
  if (candidates.length === 0) return state
  if (candidates.some((m) => m.promotion)) {
    return { ...state, pendingPromotion: { from, to } }
  }
  const move = chess.move({ from, to })
  return commitMove(state, chess, move)
}

export function promote(state: GameState, piece: PromotionPiece): GameState {
  if (!state.pendingPromotion) return state
  const chess = new Chess(state.fen)
  const move = chess.move({
    from: state.pendingPromotion.from,
    to: state.pendingPromotion.to,
    promotion: piece,
  })
  return commitMove(state, chess, move)
}

function commitMove(state: GameState, chess: Chess, move: CommittedMove): GameState {
  const captured = { w: [...state.captured.w], b: [...state.captured.b] }
  if (move.captured) captured[move.color].push(move.captured)
  const winner = chess.isCheckmate() ? (chess.turn() === 'w' ? 'b' : 'w') : null
  return {
    fen: chess.fen(),
    history: [...state.history, move.san],
    captured,
    turn: chess.turn(),
    status: getStatus(chess),
    winner,
    pendingPromotion: null,
  }
}

export function undo(state: GameState): GameState {
  if (state.history.length === 0) return state
  const chess = new Chess()
  for (const san of state.history) chess.move(san)
  const undone = chess.undo()
  if (!undone) return state
  const captured = { w: [...state.captured.w], b: [...state.captured.b] }
  if (undone.captured) captured[undone.color].pop()
  return {
    fen: chess.fen(),
    history: state.history.slice(0, -1),
    captured,
    turn: chess.turn(),
    status: getStatus(chess),
    winner: null,
    pendingPromotion: null,
  }
}

export function getLegalTargetSquares(fen: string, from: string): string[] {
  const chess = new Chess(fen)
  return chess.moves({ square: from as never, verbose: true }).map((m) => m.to)
}
