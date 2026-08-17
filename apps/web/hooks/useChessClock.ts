import { useCallback, useEffect, useRef, useState } from 'react'
import { TERMINAL_STATUSES } from '../lib/types'
import type { GameStatus, PlayerColor, TimeControl } from '../lib/types'

const TICK_MS = 100

export function useChessClock(
  turn: PlayerColor,
  status: GameStatus,
  timeControl: TimeControl,
  onTimeout: (color: PlayerColor) => void,
) {
  const [clocks, setClocks] = useState<{ w: number; b: number }>(() => {
    const ms = timeControl.minutes * 60_000
    return { w: ms, b: ms }
  })
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout
  const running = !TERMINAL_STATUSES.includes(status)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setClocks((prev) => {
        const next = prev[turn] - TICK_MS
        if (next <= 0) {
          clearInterval(id)
          onTimeoutRef.current(turn)
          return { ...prev, [turn]: 0 }
        }
        return { ...prev, [turn]: next }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running, turn])

  const reset = useCallback(() => {
    const ms = timeControl.minutes * 60_000
    setClocks({ w: ms, b: ms })
  }, [timeControl.minutes])

  return { clocks, reset }
}
