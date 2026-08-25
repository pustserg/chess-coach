'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { useOnlineGame } from '../hooks/useOnlineGame'
import { useAuth } from '../hooks/useAuth'
import { getCheckSquare, getLegalTargetSquares } from '../lib/chess'
import type { GameStatus, ResultReason } from '../lib/types'
import PlayerCard from './PlayerCard'
import MoveHistory from './MoveHistory'
import PromotionModal from './PromotionModal'
import GameOverModal from './GameOverModal'

const REASON_STATUS: Record<ResultReason, GameStatus> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  threefold: 'threefold-repetition',
  insufficient: 'insufficient-material',
  'fifty-move': 'fifty-move',
  timeout: 'timeout',
  resignation: 'resignation',
  'agreed-draw': 'agreed-draw',
}

export default function OnlineGame({ gameId }: { gameId: string }) {
  const { loading, guest, getAccessToken } = useAuth()

  // Auto-mint a guest session once auth is ready but no token exists
  // (a brand-new visitor opening a shared /game/[id] invite link).
  useEffect(() => {
    if (!loading && !getAccessToken()) void guest()
  }, [loading, guest, getAccessToken])

  if (!getAccessToken()) {
    return <p className="text-gray-500">Authenticating…</p>
  }

  return <OnlineGameBoard gameId={gameId} />
}

function OnlineGameBoard({ gameId }: { gameId: string }) {
  const { state, connected, sendMove, resign, offerDraw, acceptDraw, declineDraw } = useOnlineGame(gameId)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)

  const topIsBlack = state?.youAre === 'w'
  const opponent = state ? (state.youAre === 'w' ? state.black : state.white) : null
  const self = state ? (state.youAre === 'w' ? state.white : state.black) : null
  const opponentName = opponent?.displayName ?? 'Opponent'
  const selfName = self?.displayName ?? 'You'

  const legalTargets = useMemo(
    () => (state && selected ? getLegalTargetSquares(state.fen, selected) : []),
    [state, selected],
  )
  const checkSquare = state?.checkSquare ?? (state ? getCheckSquare(state.fen) : null)
  const terminal = state?.result != null

  const myTurn = state?.turn === state?.youAre

  const squareStyles: Record<string, React.CSSProperties> = {}
  for (const sq of legalTargets) squareStyles[sq] = { backgroundColor: 'rgba(34,197,94,0.4)' }
  if (state?.lastMove) {
    squareStyles[state.lastMove.from] = { backgroundColor: 'rgba(250,204,21,0.5)' }
    squareStyles[state.lastMove.to] = { backgroundColor: 'rgba(250,204,21,0.5)' }
  }
  if (checkSquare) squareStyles[checkSquare] = { backgroundColor: 'rgba(239,68,68,0.5)' }

  if (!state) {
    return <p className="text-gray-500">Connecting…</p>
  }

  const handleSquareClick = (square: string) => {
    if (terminal || !myTurn) return
    const chess = new Chess(state.fen)
    if (selected) {
      if (legalTargets.includes(square)) {
        const moves = chess.moves({ square: selected as never, verbose: true }).filter((m) => m.to === square)
        if (moves.some((m) => m.promotion)) setPromotion({ from: selected, to: square })
        else sendMove(selected, square)
        setSelected(null)
      } else if (chess.get(square as never)?.color === state.turn) setSelected(square)
      else setSelected(null)
    } else if (chess.get(square as never)?.color === state.turn) setSelected(square)
  }

  const handlePieceDrop = (from: string, to: string) => {
    if (terminal || !myTurn) return false
    const chess = new Chess(state.fen)
    const moves = chess.moves({ square: from as never, verbose: true }).filter((m) => m.to === to)
    if (moves.length === 0) return false
    if (moves.some((m) => m.promotion)) setPromotion({ from, to })
    else sendMove(from, to)
    return true
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      {!connected && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-700">Reconnecting…</p>}
      {!opponent?.connected && <p className="rounded-lg bg-gray-100 p-2 text-sm text-gray-600">Opponent disconnected — the clock keeps running</p>}
      {state.status === 'waiting' && <p className="text-sm text-gray-600">Waiting for opponent — share the link to invite them</p>}
      {state.drawOfferedBy && (
        <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <span>Draw offered</span>
          {state.drawOfferedBy !== state.youAre && (
            <>
              <button onClick={acceptDraw} className="rounded-lg bg-green-600 px-2 py-1 text-white">Accept</button>
              <button onClick={declineDraw} className="rounded-lg bg-gray-100 px-2 py-1">Decline</button>
            </>
          )}
        </div>
      )}

      <PlayerCard
        name={topIsBlack ? opponentName : selfName}
        captured={topIsBlack ? state.captured.b : state.captured.w}
        remainingMs={topIsBlack ? state.clocks.b_ms : state.clocks.w_ms}
        active={state.turn === 'b'}
      />

      <Chessboard
        options={{
          position: state.fen,
          boardOrientation: state.youAre === 'w' ? 'white' : 'black',
          squareStyles,
          onSquareClick: ({ square }) => handleSquareClick(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
          allowDragging: true,
          showNotation: true,
        }}
      />

      <PlayerCard
        name={topIsBlack ? selfName : opponentName}
        captured={topIsBlack ? state.captured.w : state.captured.b}
        remainingMs={topIsBlack ? state.clocks.w_ms : state.clocks.b_ms}
        active={state.turn === 'w'}
      />

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={offerDraw} disabled={terminal} className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40">Offer draw</button>
          <button onClick={resign} disabled={terminal} className="rounded-lg bg-red-600 px-3 py-1 text-white disabled:opacity-40">Resign</button>
        </div>
      </div>

      <MoveHistory history={state.sanHistory} />

      {promotion && (
        <PromotionModal onSelect={(piece) => { sendMove(promotion.from, promotion.to, piece); setPromotion(null) }} />
      )}

      {terminal && state.result && (
        <GameOverModal
          status={REASON_STATUS[state.result.reason]}
          winner={state.result.result === 'draw' ? null : (state.result.result === 'white' ? 'w' : 'b')}
          onNewGame={() => {}}
        />
      )}
    </div>
  )
}
