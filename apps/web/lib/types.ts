import type { AuthUser } from './api'

export type PlayerColor = 'w' | 'b'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'
export type GameStatus =
  | 'playing' | 'check' | 'checkmate' | 'stalemate'
  | 'threefold-repetition' | 'insufficient-material' | 'fifty-move' | 'timeout'
  | 'resignation' | 'agreed-draw'
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

export type GameMode = 'pass-and-play' | 'vs-computer' | 'online'
export type SideChoice = 'white' | 'black' | 'random'
export type PlayerSide = 'white' | 'black'
export type DifficultyPreset = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert'
export interface EngineOptions { level: number; depth: number }
export interface Evaluation {
  scoreCp: number | null
  scoreMate: number | null
  lines: string[][]
}
export interface GameConfig {
  mode: GameMode
  side: SideChoice
  difficulty: DifficultyPreset
  custom: { level: number; depth: number } | null
}

export const DIFFICULTY_PRESETS: Record<DifficultyPreset, EngineOptions> = {
  beginner: { level: 1, depth: 2 },
  casual: { level: 5, depth: 8 },
  intermediate: { level: 10, depth: 12 },
  advanced: { level: 15, depth: 16 },
  expert: { level: 20, depth: 20 },
}

export function resolveEngineOptions(config: GameConfig): EngineOptions {
  return config.custom ?? DIFFICULTY_PRESETS[config.difficulty]
}

export function sideToColor(side: PlayerSide): PlayerColor {
  return side === 'white' ? 'w' : 'b'
}

export type OnlineStatus = 'waiting' | 'playing' | 'white-won' | 'black-won' | 'draw' | 'aborted'
export type ResultReason =
  | 'checkmate' | 'stalemate' | 'threefold' | 'insufficient' | 'fifty-move'
  | 'timeout' | 'resignation' | 'agreed-draw'
export interface OnlinePlayer {
  id: string | null
  displayName: string | null
  connected: boolean
}
export interface OnlineGameState {
  status: OnlineStatus
  turn: PlayerColor
  fen: string
  sanHistory: string[]
  lastMove: { from: string; to: string } | null
  check: boolean
  checkSquare: string | null
  clocks: { w_ms: number; b_ms: number }
  white: OnlinePlayer
  black: OnlinePlayer
  youAre: PlayerColor
  captured: { w: string[]; b: string[] }
  result: { result: 'white' | 'black' | 'draw'; reason: ResultReason } | null
  drawOfferedBy: PlayerColor | null
}

export interface AuthResponse { user: AuthUser; tokens: { access_token: string; refresh_token: string } }
export interface GameSummary { id: string; status: OnlineStatus; white_player_id: string | null; black_player_id: string | null; time_control_minutes: number }
export interface Stats { games_played: number; wins: number; losses: number; draws: number }
