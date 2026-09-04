'use client'

import { useEffect, useRef } from 'react'
import type { EngineOptions, GameStatus, PlayerColor } from '../lib/types'

const MIN_DELAY_MS = 300
const MAX_DELAY_MS = 800
const RETRY_DELAY_MS = 500
const MAX_ATTEMPTS = 2

interface Args {
  enabled: boolean
  botColor: PlayerColor
  fen: string
  turn: PlayerColor
  status: GameStatus
  pendingPromotion: boolean
  engineOptions: EngineOptions
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  onMove: (uci: string) => boolean
}

export function useBotOpponent(args: Args): { thinking: boolean } {
  const { enabled, botColor, fen, turn, status, pendingPromotion, engineOptions, getBestMove, onMove } = args
  const generationRef = useRef(0)

  const live = status === 'playing' || status === 'check'
  const thinking = enabled && live && !pendingPromotion && turn === botColor

  useEffect(() => {
    generationRef.current += 1
  }, [fen])

  useEffect(() => {
    if (!enabled || !live || pendingPromotion || turn !== botColor) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const generation = generationRef.current
    const isCurrent = () => !cancelled && generation === generationRef.current

    // A dropped engine request would leave the bot's turn hanging forever, so
    // retry once before giving up (bounded — never a retry loop). The same
    // recovery applies when the promise resolves but onMove reports the move
    // didn't apply — e.g. a stale worker reply (the UCI protocol carries no
    // request id) resolving a later request with a move for a position
    // that's no longer current.
    const scheduleRetry = (attempt: number) => {
      if (!isCurrent() || attempt >= MAX_ATTEMPTS) return
      retryTimer = setTimeout(() => request(attempt + 1), RETRY_DELAY_MS)
    }

    const request = (attempt: number) => {
      getBestMove(fen, engineOptions)
        .then((uci) => {
          if (!isCurrent()) return
          if (!onMove(uci)) scheduleRetry(attempt)
        })
        .catch(() => scheduleRetry(attempt))
    }

    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    const timer = setTimeout(() => request(1), delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (retryTimer !== null) clearTimeout(retryTimer)
    }
  }, [enabled, botColor, fen, turn, status, pendingPromotion, engineOptions, getBestMove, onMove, live])

  return { thinking }
}
