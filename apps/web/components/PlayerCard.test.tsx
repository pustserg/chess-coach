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

  it('shows a thinking indicator when thinking is true', () => {
    render(<PlayerCard color="w" name="Computer" captured={[]} remainingMs={600000} active thinking />)
    expect(screen.getByText(/thinking/)).toBeInTheDocument()
  })

  it('hides the thinking indicator by default', () => {
    render(<PlayerCard color="w" name="Computer" captured={[]} remainingMs={600000} active />)
    expect(screen.queryByText(/thinking/)).not.toBeInTheDocument()
  })
})
