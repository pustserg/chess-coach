import type { Evaluation, PlayerColor } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachContext {
  fen: string
  moveHistorySan: string[]
  sideToMove: PlayerColor
  evaluation: Evaluation
  targetElo: number
}

export async function streamCoachReply(
  context: CoachContext,
  messages: CoachMessage[],
  onToken: (token: string) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/coach/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: context.fen,
      move_history_san: context.moveHistorySan,
      side_to_move: context.sideToMove,
      evaluation: {
        score_cp: context.evaluation.scoreCp,
        score_mate: context.evaluation.scoreMate,
        lines: context.evaluation.lines,
      },
      target_elo: context.targetElo,
      messages,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`coach unavailable (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onToken(decoder.decode(value, { stream: true }))
  }
}
