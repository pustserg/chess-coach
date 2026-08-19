import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModeSelector from './ModeSelector'

describe('ModeSelector', () => {
  it('reports the selected mode on click', async () => {
    const onChange = vi.fn()
    render(<ModeSelector mode="pass-and-play" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(onChange).toHaveBeenCalledWith('vs-computer')
  })

  it('marks the active mode as checked', () => {
    render(<ModeSelector mode="vs-computer" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Play vs. Computer' })).toHaveAttribute('aria-checked', 'true')
  })
})
