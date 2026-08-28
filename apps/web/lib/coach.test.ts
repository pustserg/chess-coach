import { describe, expect, it, vi } from 'vitest'
import { streamCoachReply } from './coach'
import type { CoachContext, CoachMessage } from './coach'

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status })
}

const CONTEXT: CoachContext = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moveHistorySan: ['e4', 'e5'],
  sideToMove: 'w',
  targetElo: 2000,
  evaluation: { scoreCp: 20, scoreMate: null, lines: [['Nf3', 'Nf6']] },
}

describe('streamCoachReply', () => {
  it('posts the context and messages, and streams tokens to onToken', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(['Hel', 'lo']))
    const messages: CoachMessage[] = [{ role: 'user', content: "What's the plan?" }]
    const tokens: string[] = []

    await streamCoachReply(CONTEXT, messages, (token) => tokens.push(token))

    expect(tokens.join('')).toBe('Hello')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/coach/message')
    const body = JSON.parse(init!.body as string)
    expect(body).toEqual({
      fen: CONTEXT.fen,
      move_history_san: CONTEXT.moveHistorySan,
      side_to_move: CONTEXT.sideToMove,
      evaluation: { score_cp: 20, score_mate: null, lines: [['Nf3', 'Nf6']] },
      target_elo: 2000,
      messages: [{ role: 'user', content: "What's the plan?" }],
    })
  })

  it('throws when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 502 }))
    await expect(streamCoachReply(CONTEXT, [], vi.fn())).rejects.toThrow('coach unavailable (502)')
  })
})
