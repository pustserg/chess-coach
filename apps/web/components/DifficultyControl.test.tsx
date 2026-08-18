import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DifficultyControl from './DifficultyControl'
import type { GameConfig } from '../lib/types'

const base: GameConfig = { mode: 'vs-computer', side: 'white', difficulty: 'intermediate', custom: null }

describe('DifficultyControl', () => {
  it('selecting a preset clears custom', async () => {
    const onChange = vi.fn()
    render(<DifficultyControl config={base} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'expert')
    expect(onChange).toHaveBeenCalledWith({ ...base, difficulty: 'expert', custom: null })
  })

  it('reveals sliders when Advanced is toggled', async () => {
    render(<DifficultyControl config={base} onChange={() => {}} />)
    expect(screen.queryByLabelText(/Skill Level/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Advanced/ }))
    expect(screen.getByLabelText(/Skill Level/)).toBeInTheDocument()
  })

  it('moving a slider sets custom', () => {
    const onChange = vi.fn()
    render(<DifficultyControl config={{ ...base, custom: { level: 10, depth: 12 } }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Max Depth/), { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith({ ...base, custom: { level: 10, depth: 15 } })
  })
})
