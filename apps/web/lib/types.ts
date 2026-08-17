export type PlayerColor = 'w' | 'b'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'
export type GameStatus =
  | 'playing' | 'check' | 'checkmate' | 'stalemate'
  | 'threefold-repetition' | 'insufficient-material' | 'fifty-move' | 'timeout'
export interface TimeControl { minutes: number }
export interface GameState {
  fen: string
  history: string[]
  captured: { w: string[]; b: string[] }
  turn: PlayerColor
  status: GameStatus
  winner: PlayerColor | null
  pendingPromotion: { from: string; to: string } | null
}
export const TERMINAL_STATUSES: readonly GameStatus[] = [
  'checkmate', 'stalemate', 'threefold-repetition',
  'insufficient-material', 'fifty-move', 'timeout',
]
