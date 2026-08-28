'use client'

import { useEffect, useRef, useState } from 'react'
import { uciLineToSan } from '../lib/chess'
import type { CoachContext, CoachMessage } from '../lib/coach'
import type { Evaluation, PlayerColor } from '../lib/types'

const TARGET_ELO = 2000
const EVAL_DEPTH = 16

export interface CoachDrawerProps {
  fen: string
  moveHistorySan: string[]
  sideToMove: PlayerColor
  getEvaluation: (fen: string, depth: number) => Promise<Evaluation>
  streamReply: (
    context: CoachContext,
    messages: CoachMessage[],
    onToken: (token: string) => void,
  ) => Promise<void>
  onClose: () => void
}

export default function CoachDrawer({
  fen,
  moveHistorySan,
  sideToMove,
  getEvaluation,
  streamReply,
  onClose,
}: CoachDrawerProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evalReady, setEvalReady] = useState(false)
  const evalCacheRef = useRef<Map<string, Evaluation>>(new Map())

  useEffect(() => {
    if (evalCacheRef.current.has(fen)) {
      setError(null)
      setEvalReady(true)
      return
    }
    setError(null)
    setEvalReady(false)
    let cancelled = false
    getEvaluation(fen, EVAL_DEPTH)
      .then((evaluation) => {
        if (cancelled) return
        evalCacheRef.current.set(fen, evaluation)
        setEvalReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('Coach is unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [fen, getEvaluation])

  const handleSend = async () => {
    const text = input.trim()
    const evaluation = evalCacheRef.current.get(fen)
    if (!text || streaming || !evaluation) return

    const nextMessages: CoachMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    setError(null)

    const context: CoachContext = {
      fen,
      moveHistorySan,
      sideToMove,
      targetElo: TARGET_ELO,
      evaluation: {
        scoreCp: evaluation.scoreCp,
        scoreMate: evaluation.scoreMate,
        lines: evaluation.lines.map((line) => uciLineToSan(fen, line)),
      },
    }

    try {
      await streamReply(context, nextMessages, (token) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + token }
          return updated
        })
      })
    } catch {
      setError('Coach is unavailable')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex max-h-[70vh] flex-col gap-2 rounded-t-2xl border border-gray-200 bg-white p-3 shadow-lg md:static md:max-h-none md:rounded-lg md:shadow-none">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Ask Coach</h2>
        <button type="button" aria-label="Close coach" onClick={onClose} className="text-gray-500">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        {!evalReady && !error && <p className="text-gray-500">Analyzing position…</p>}
        {messages.map((m, i) => (
          <p key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>{m.content}</p>
        ))}
        {error && <p className="text-red-600">{error}</p>}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Ask the coach"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          disabled={!evalReady || streaming}
          className="flex-1 rounded-lg border border-gray-200 px-2 py-1"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!evalReady || streaming || !input.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1 text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
