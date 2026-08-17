import { formatClock } from '../lib/format'
import type { PlayerColor } from '../lib/types'

const GLYPHS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }

export default function PlayerCard({
  color, name, captured, remainingMs, active,
}: {
  color: PlayerColor
  name: string
  captured: string[]
  remainingMs: number
  active: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
      <div>
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-gray-600">{captured.map((c) => GLYPHS[c]).join(' ') || '—'}</div>
      </div>
      <div className="font-mono text-lg tabular-nums">{formatClock(remainingMs)}</div>
    </div>
  )
}
