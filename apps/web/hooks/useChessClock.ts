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
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])
  const running = !TERMINAL_STATUSES.includes(status)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setClocks((prev) => {
        if (prev[turn] <= 0) return prev
        return { ...prev, [turn]: Math.max(0, prev[turn] - TICK_MS) }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running, turn])

  useEffect(() => {
    if (clocks.w === 0) onTimeoutRef.current('w')
    else if (clocks.b === 0) onTimeoutRef.current('b')
  }, [clocks])

  const reset = useCallback((minutes?: number) => {
    const ms = (minutes ?? timeControl.minutes) * 60_000
    setClocks({ w: ms, b: ms })
  }, [timeControl.minutes])

  return { clocks, reset }
}
