'use client'

import { useEffect, useRef } from 'react'
import type { EngineOptions, GameStatus, PlayerColor } from '../lib/types'

const MIN_DELAY_MS = 300
const MAX_DELAY_MS = 800

interface Args {
  enabled: boolean
  botColor: PlayerColor
  fen: string
  turn: PlayerColor
  status: GameStatus
  pendingPromotion: boolean
  engineOptions: EngineOptions
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  onMove: (uci: string) => void
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
    const generation = generationRef.current
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    const timer = setTimeout(() => {
      getBestMove(fen, engineOptions)
        .then((uci) => {
          if (!cancelled && generation === generationRef.current) {
            onMove(uci)
          }
        })
        .catch(() => {})
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, botColor, fen, turn, status, pendingPromotion, engineOptions, getBestMove, onMove, live])

  return { thinking }
}
