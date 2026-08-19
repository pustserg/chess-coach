'use client'

import { useState } from 'react'
import { DIFFICULTY_PRESETS, resolveEngineOptions } from '../lib/types'
import type { DifficultyPreset, GameConfig } from '../lib/types'

const PRESETS = Object.keys(DIFFICULTY_PRESETS) as DifficultyPreset[]

export default function DifficultyControl({
  config,
  onChange,
}: {
  config: GameConfig
  onChange: (config: GameConfig) => void
}) {
  const [advanced, setAdvanced] = useState(config.custom !== null)
  const current = resolveEngineOptions(config)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor="difficulty" className="text-sm text-gray-600">Difficulty</label>
        <select
          id="difficulty"
          aria-label="Difficulty"
          value={config.difficulty}
          onChange={(e) => onChange({ ...config, difficulty: e.target.value as DifficultyPreset, custom: null })}
          className="rounded-lg bg-gray-100 px-2 py-1"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            setAdvanced(e.target.checked)
            if (!e.target.checked) onChange({ ...config, custom: null })
          }}
        />
        Advanced
      </label>

      {advanced && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">
            Skill Level: {current.level}
            <input
              type="range"
              min={0}
              max={20}
              value={current.level}
              onChange={(e) => onChange({ ...config, custom: { level: Number(e.target.value), depth: current.depth } })}
              className="w-full"
            />
          </label>
          <label className="text-sm text-gray-600">
            Max Depth: {current.depth}
            <input
              type="range"
              min={1}
              max={20}
              value={current.depth}
              onChange={(e) => onChange({ ...config, custom: { level: current.level, depth: Number(e.target.value) } })}
              className="w-full"
            />
          </label>
        </div>
      )}
    </div>
  )
}
