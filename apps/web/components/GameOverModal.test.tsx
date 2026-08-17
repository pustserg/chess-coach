import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameOverModal from './GameOverModal'

describe('GameOverModal', () => {
  it('shows the result and reason', () => {
    render(<GameOverModal status="checkmate" winner="b" onNewGame={() => {}} />)
    expect(screen.getByText('Black wins')).toBeInTheDocument()
    expect(screen.getByText('Checkmate')).toBeInTheDocument()
  })
})
