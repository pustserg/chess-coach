'use client'

import type { GameMode } from '../lib/types'

export default function ModeSelector({
  mode,
  onChange,
}: {
  mode: GameMode
  onChange: (mode: GameMode) => void
}) {
  return (
    <div role="radiogroup" aria-label="Game mode" className="flex gap-1 rounded-lg bg-gray-100 p-1">
      {(['pass-and-play', 'vs-computer'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`flex-1 rounded-md px-3 py-1 ${mode === m ? 'bg-white font-medium shadow' : 'text-gray-600'}`}
        >
          {m === 'pass-and-play' ? 'Pass & Play' : 'Play vs. Computer'}
        </button>
      ))}
    </div>
  )
}
