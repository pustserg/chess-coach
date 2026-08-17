import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlayerCard from './PlayerCard'

describe('PlayerCard', () => {
  it('shows name, captured pieces, and clock', () => {
    render(<PlayerCard color="w" name="White" captured={['p', 'n']} remainingMs={5 * 60_000} active />)
    expect(screen.getByText('White')).toBeInTheDocument()
    expect(screen.getByText('♟ ♞')).toBeInTheDocument()
    expect(screen.getByText('5:00')).toBeInTheDocument()
  })
})
