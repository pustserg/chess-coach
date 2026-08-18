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

export type GameMode = 'pass-and-play' | 'vs-computer'
export type SideChoice = 'white' | 'black' | 'random'
export type PlayerSide = 'white' | 'black'
export type DifficultyPreset = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert'
export interface EngineOptions { level: number; depth: number }
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
