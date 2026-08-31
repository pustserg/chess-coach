'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import {
  applyBotMove,
  applyMove,
  createInitialState,
  getCheckSquare,
  getLastMove,
  getLegalTargetSquares,
  promote,
  undoPlies,
} from '../lib/chess'
import { TERMINAL_STATUSES, resolveEngineOptions, sideToColor } from '../lib/types'
import type {
  GameConfig,
  GameMode,
  GameState,
  PlayerColor,
  PlayerSide,
  PromotionPiece,
  SideChoice,
  TimeControl,
} from '../lib/types'
import { useChessClock } from '../hooks/useChessClock'
import { useStockfish } from '../hooks/useStockfish'
import { useBotOpponent } from '../hooks/useBotOpponent'
import PlayerCard from './PlayerCard'
import MoveHistory from './MoveHistory'
import PromotionModal from './PromotionModal'
import GameOverModal from './GameOverModal'
import ModeSelector from './ModeSelector'
import DifficultyControl from './DifficultyControl'
import CoachDrawer from './CoachDrawer'
import { streamCoachReply } from '../lib/coach'

const PRESETS = [3, 5, 10] as const
type FlipMode = 'auto' | 'manual' | 'off'

const DEFAULT_CONFIG: GameConfig = {
  mode: 'pass-and-play',
  side: 'white',
  difficulty: 'intermediate',
  custom: null,
}

export type Action =
  | { type: 'move'; from: string; to: string }
  | { type: 'promote'; piece: PromotionPiece }
  | { type: 'undo'; plies?: number }
  | { type: 'bot-move'; uci: string }
  | { type: 'new-game' }
  | { type: 'timeout'; color: PlayerColor }

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move': return applyMove(state, action.from, action.to)
    case 'promote': return promote(state, action.piece)
    case 'undo': return undoPlies(state, action.plies ?? 1)
    case 'bot-move': return applyBotMove(state, action.uci)
    case 'new-game': return createInitialState({ minutes: 10 })
    case 'timeout':
      if (state.status !== 'playing' && state.status !== 'check') return state
      return { ...state, status: 'timeout', winner: action.color === 'w' ? 'b' : 'w', pendingPromotion: null }
    default: return state
  }
}

export default function ChessGame() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)
  const [timeControl, setTimeControl] = useState<TimeControl>({ minutes: 10 })
  const [state, dispatch] = useReducer(reducer, timeControl, createInitialState)
  // Mirrors `state` for handleBotMove below, which reads it from an async
  // callback (an engine promise resolving well after this render and its
  // effects have committed) rather than during render — so, unlike
  // coachVisible below, there's no child-effect-before-parent-effect race to
  // worry about here, and syncing in an effect keeps `stateRef.current`
  // write out of render (accessing/writing a ref during render is a lint
  // error: react-hooks/refs).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const [selected, setSelected] = useState<string | null>(null)
  const [flipMode, setFlipMode] = useState<FlipMode>('auto')
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>('white')
  const [resolvedSide, setResolvedSide] = useState<PlayerSide>('white')
  const [coachFen, setCoachFen] = useState<string | null>(null)

  const vsComputer = config.mode === 'vs-computer'
  const humanColor: PlayerColor = sideToColor(resolvedSide)
  const botColor: PlayerColor = resolvedSide === 'white' ? 'b' : 'w'
  const engineOptions = resolveEngineOptions(config)

  const { ready, error, getBestMove, getEvaluation, newGame: engineNewGame } = useStockfish(vsComputer)

  // A stale worker reply (the UCI protocol carries no request id) can resolve
  // a later getBestMove call with a move for a position that's no longer
  // current. applyBotMove safely no-ops on an illegal move, returning the
  // same state reference — that's the signal used here to report back to
  // useBotOpponent so it can retry instead of silently dropping the bot's
  // turn. Reads stateRef rather than closing over `state` so this callback
  // stays referentially stable (it's a dependency of useBotOpponent's effect,
  // and a new identity every render — e.g. on every clock tick — would make
  // that effect re-run far more than it should).
  const handleBotMove = useCallback((uci: string) => {
    const next = applyBotMove(stateRef.current, uci)
    if (next === stateRef.current) return false
    dispatch({ type: 'bot-move', uci })
    return true
  }, [])

  const { thinking } = useBotOpponent({
    enabled: vsComputer && !error,
    botColor,
    fen: state.fen,
    turn: state.turn,
    status: state.status,
    pendingPromotion: state.pendingPromotion !== null,
    engineOptions,
    getBestMove,
    onMove: handleBotMove,
  })

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

  const lastMove = useMemo(() => getLastMove(state.history), [state.history])
  const checkSquare = useMemo(() => getCheckSquare(state.fen), [state.fen])

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    for (const sq of legalTargets) styles[sq] = { backgroundColor: 'rgba(34,197,94,0.4)' }
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(250,204,21,0.5)' }
      styles[lastMove.to] = { backgroundColor: 'rgba(250,204,21,0.5)' }
    }
    if (checkSquare) styles[checkSquare] = { backgroundColor: 'rgba(239,68,68,0.5)' }
    return styles
  }, [legalTargets, lastMove, checkSquare])

  const boardOrientation = flipMode === 'auto' ? (state.turn === 'w' ? 'white' : 'black')
    : flipMode === 'manual' ? manualOrientation
    : 'white'

  const humanMayAct = !vsComputer || state.turn === humanColor

  // The coach is scoped to the exact position it was opened for, so the moment
  // the position changes — the player's own move, an undo, a new game — the
  // drawer goes away. Without that, an open drawer fires a fresh depth-16
  // evaluation for the bot-to-move position and competes with the bot's own
  // request on the single shared engine worker.
  //
  // Derived during render rather than reset from an effect: setState in an
  // effect is a lint error here, and an effect would also be too late — child
  // effects run before parent effects, so the drawer would still get one
  // evaluation in for the bot's position before being closed.
  const coachVisible = coachFen === state.fen
    && vsComputer
    && state.turn === humanColor
    && !TERMINAL_STATUSES.includes(state.status)

  const handleSquareClick = (square: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return
    if (!humanMayAct) return
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
    if (!humanMayAct) return false
    const next = applyMove(state, sourceSquare, targetSquare)
    if (next === state) return false
    dispatch({ type: 'move', from: sourceSquare, to: targetSquare })
    return true
  }

  const undoEnabled = vsComputer
    ? state.turn === humanColor && state.history.length >= 2 && !thinking
    : state.history.length >= 1

  const startGame = (side: PlayerSide) => {
    setResolvedSide(side)
    dispatch({ type: 'new-game' })
    reset()
    setSelected(null)
    engineNewGame()
  }

  const newGame = () => {
    const side: PlayerSide = config.side === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : config.side
    startGame(side)
  }

  const handleModeChange = (mode: GameMode) => {
    setConfig((c) => ({ ...c, mode }))
    const side: PlayerSide = mode === 'vs-computer'
      ? (config.side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : config.side)
      : 'white'
    startGame(side)
  }

  const handleSideChange = (side: SideChoice) => {
    setConfig((c) => ({ ...c, side }))
    const resolved: PlayerSide = side === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : side
    startGame(resolved)
  }

  const topName = vsComputer ? (resolvedSide === 'black' ? 'You' : 'Computer') : 'Black'
  const bottomName = vsComputer ? (resolvedSide === 'white' ? 'You' : 'Computer') : 'White'
  const topIsBot = vsComputer && botColor === 'b'
  const bottomIsBot = vsComputer && botColor === 'w'

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <ModeSelector mode={config.mode} onChange={handleModeChange} />

      {vsComputer && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            You play
            <select
              aria-label="You play"
              value={config.side}
              onChange={(e) => handleSideChange(e.target.value as SideChoice)}
              className="rounded-lg bg-gray-100 px-2 py-1"
            >
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="random">Random</option>
            </select>
          </label>
          <DifficultyControl config={config} onChange={setConfig} />
          {error ? (
            <p className="text-sm text-red-600">Engine unavailable — switch to Pass & Play to continue</p>
          ) : !ready ? (
            <p className="text-sm text-amber-600">Engine loading…</p>
          ) : null}
        </div>
      )}

      <PlayerCard
        name={topName}
        captured={state.captured.b}
        remainingMs={clocks.b}
        active={state.turn === 'b'}
        thinking={topIsBot && thinking}
      />

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

      <PlayerCard
        name={bottomName}
        captured={state.captured.w}
        remainingMs={clocks.w}
        active={state.turn === 'w'}
        thinking={bottomIsBot && thinking}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            aria-label="Time control"
            value={timeControl.minutes}
            onChange={(e) => {
              const minutes = Number(e.target.value)
              setTimeControl({ minutes })
              dispatch({ type: 'new-game' })
              setSelected(null)
              reset(minutes)
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
          <button
            type="button"
            onClick={() => dispatch({ type: 'undo', plies: vsComputer ? 2 : 1 })}
            disabled={!undoEnabled}
            className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40"
          >
            Undo
          </button>
          {vsComputer && (
            <button
              type="button"
              onClick={() => setCoachFen(state.fen)}
              disabled={state.turn !== humanColor || thinking || TERMINAL_STATUSES.includes(state.status)}
              className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40"
            >
              Ask Coach
            </button>
          )}
          <button type="button" onClick={newGame} className="rounded-lg bg-blue-600 px-3 py-1 text-white">New Game</button>
        </div>
      </div>

      <MoveHistory history={state.history} />

      {state.pendingPromotion && (
        <PromotionModal onSelect={(piece) => dispatch({ type: 'promote', piece })} />
      )}

      {TERMINAL_STATUSES.includes(state.status) && (
        <GameOverModal status={state.status} winner={state.winner} onNewGame={newGame} />
      )}

      {coachVisible && (
        <CoachDrawer
          fen={state.fen}
          moveHistorySan={state.history}
          sideToMove={state.turn}
          getEvaluation={getEvaluation}
          streamReply={streamCoachReply}
          onClose={() => setCoachFen(null)}
        />
      )}
    </div>
  )
}
