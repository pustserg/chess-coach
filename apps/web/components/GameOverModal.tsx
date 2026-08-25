import type { GameStatus, PlayerColor } from '../lib/types'

const REASONS: Partial<Record<GameStatus, string>> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  'threefold-repetition': 'Threefold repetition',
  'insufficient-material': 'Insufficient material',
  'fifty-move': 'Fifty-move rule',
  timeout: 'Time out',
  resignation: 'Resignation',
  'agreed-draw': 'Agreed draw',
}

export default function GameOverModal({
  status, winner, onNewGame,
}: {
  status: GameStatus
  winner: PlayerColor | null
  onNewGame: () => void
}) {
  const title = winner ? `${winner === 'w' ? 'White' : 'Black'} wins` : 'Draw'
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-white p-6 text-center" role="dialog" aria-label="Game over">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-gray-600">{REASONS[status] ?? status}</p>
        <button type="button" onClick={onNewGame} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white">
          New Game
        </button>
      </div>
    </div>
  )
}
