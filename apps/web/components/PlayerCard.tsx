import { formatClock } from '../lib/format'

const GLYPHS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }

export default function PlayerCard({
  name, captured, remainingMs, active, thinking = false,
}: {
  name: string
  captured: string[]
  remainingMs: number
  active: boolean
  thinking?: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
      <div>
        <div className="flex items-center gap-2 font-semibold">
          {name}
          {thinking && <span className="text-xs font-normal text-gray-500">thinking…</span>}
        </div>
        <div className="text-sm text-gray-600">{captured.map((c) => GLYPHS[c]).join(' ') || '—'}</div>
      </div>
      <div className="font-mono text-lg tabular-nums">{formatClock(remainingMs)}</div>
    </div>
  )
}
