'use client'

import { useMemo, useReducer, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { applyMove, createInitialState, getLegalTargetSquares, promote, undo } from '../lib/chess'
import { TERMINAL_STATUSES } from '../lib/types'
import type { GameState, PlayerColor, PromotionPiece, TimeControl } from '../lib/types'
import { useChessClock } from '../hooks/useChessClock'
import PlayerCard from './PlayerCard'
import MoveHistory from './MoveHistory'
import PromotionModal from './PromotionModal'
import GameOverModal from './GameOverModal'

const PRESETS = [3, 5, 10] as const
type FlipMode = 'auto' | 'manual' | 'off'

export type Action =
  | { type: 'move'; from: string; to: string }
  | { type: 'promote'; piece: PromotionPiece }
  | { type: 'undo' }
  | { type: 'new-game' }
  | { type: 'timeout'; color: PlayerColor }

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move': return applyMove(state, action.from, action.to)
    case 'promote': return promote(state, action.piece)
    case 'undo': return undo(state)
    case 'new-game': return createInitialState({ minutes: 10 })
    case 'timeout':
      if (state.status !== 'playing' && state.status !== 'check') return state
      return { ...state, status: 'timeout', winner: action.color === 'w' ? 'b' : 'w', pendingPromotion: null }
    default: return state
  }
}

export default function ChessGame() {
  const [timeControl, setTimeControl] = useState<TimeControl>({ minutes: 10 })
  const [state, dispatch] = useReducer(reducer, timeControl, createInitialState)
  const [selected, setSelected] = useState<string | null>(null)
  const [flipMode, setFlipMode] = useState<FlipMode>('auto')
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>('white')

  const { clocks, reset } = useChessClock(
    state.turn,
    state.status,
    timeControl,
    (color) => dispatch({ type: 'timeout', color }),
  )

  const legalTargets = useMemo(
    () => (selected ? getLegalTargetSquares(state.fen, selected) : []),
    [selected, state.fen],
  )

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    for (const sq of legalTargets) styles[sq] = { backgroundColor: 'rgba(34,197,94,0.4)' }
    return styles
  }, [legalTargets])

  const boardOrientation = flipMode === 'auto' ? (state.turn === 'w' ? 'white' : 'black')
    : flipMode === 'manual' ? manualOrientation
    : 'white'

  const handleSquareClick = (square: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return
    const chess = new Chess(state.fen)
    if (selected) {
      if (legalTargets.includes(square)) {
        dispatch({ type: 'move', from: selected, to: square })
        setSelected(null)
      } else if (chess.get(square as never)?.color === state.turn) {
        setSelected(square)
      } else {
        setSelected(null)
      }
    } else if (chess.get(square as never)?.color === state.turn) {
      setSelected(square)
    }
  }
  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return false
    const next = applyMove(state, sourceSquare, targetSquare)
    if (next === state) return false
    dispatch({ type: 'move', from: sourceSquare, to: targetSquare })
    return true
  }

  const newGame = () => {
    dispatch({ type: 'new-game' })
    reset()
    setSelected(null)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <PlayerCard color="b" name="Black" captured={state.captured.b} remainingMs={clocks.b} active={state.turn === 'b'} />

      <Chessboard
        options={{
          position: state.fen,
          boardOrientation,
          squareStyles,
          onSquareClick: ({ square }) => handleSquareClick(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
          allowDragging: true,
          showNotation: true,
        }}
      />

      <PlayerCard color="w" name="White" captured={state.captured.w} remainingMs={clocks.w} active={state.turn === 'w'} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            aria-label="Time control"
            value={timeControl.minutes}
            onChange={(e) => {
              setTimeControl({ minutes: Number(e.target.value) })
              dispatch({ type: 'new-game' })
              setSelected(null)
            }}
          >
            {PRESETS.map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
          <select aria-label="Board flip" value={flipMode} onChange={(e) => setFlipMode(e.target.value as FlipMode)}>
            <option value="auto">Auto flip</option>
            <option value="manual">Manual flip</option>
            <option value="off">Off</option>
          </select>
          {flipMode === 'manual' && (
            <button type="button" aria-label="Flip board" onClick={() => setManualOrientation((o) => (o === 'white' ? 'black' : 'white'))} className="rounded-lg bg-gray-100 px-3 py-1">
              Flip
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => dispatch({ type: 'undo' })} className="rounded-lg bg-gray-100 px-3 py-1">Undo</button>
          <button type="button" onClick={newGame} className="rounded-lg bg-blue-600 px-3 py-1 text-white">New Game</button>
        </div>
      </div>

      <MoveHistory history={state.history} />

      {state.pendingPromotion && (
        <PromotionModal color={state.turn} onSelect={(piece) => dispatch({ type: 'promote', piece })} />
      )}

      {TERMINAL_STATUSES.includes(state.status) && (
        <GameOverModal status={state.status} winner={state.winner} onNewGame={newGame} />
      )}
    </div>
  )
}
