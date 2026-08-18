import type { PromotionPiece } from '../lib/types'

const PIECES: { piece: PromotionPiece; label: string; glyph: string }[] = [
  { piece: 'q', label: 'Queen', glyph: '♛' },
  { piece: 'r', label: 'Rook', glyph: '♜' },
  { piece: 'b', label: 'Bishop', glyph: '♝' },
  { piece: 'n', label: 'Knight', glyph: '♞' },
]

export default function PromotionModal({
  onSelect,
}: {
  onSelect: (piece: PromotionPiece) => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-white p-4 text-center" role="dialog" aria-label="Promote pawn">
        <p className="mb-3">Promote to</p>
        <div className="flex gap-2">
          {PIECES.map(({ piece, label, glyph }) => (
            <button
              key={piece}
              type="button"
              aria-label={label}
              onClick={() => onSelect(piece)}
              className="h-14 w-14 rounded-lg bg-gray-100 text-3xl"
            >
              {glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
