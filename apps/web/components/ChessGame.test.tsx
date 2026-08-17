import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChessGame, { reducer } from './ChessGame'
import { createInitialState } from '../lib/chess'

// react-chessboard v5 renders each square as a div with a `data-square` attribute
// (e.g. `data-square="e2"`), not an `aria-label`. Click by that attribute.
async function clickSquare(container: HTMLElement, square: string) {
  const el = container.querySelector<HTMLElement>(`[data-square="${square}"]`)
  expect(el).not.toBeNull()
  await userEvent.click(el!)
}

describe('ChessGame', () => {
  it('switches turn after a move via square clicks', async () => {
    const { container } = render(<ChessGame />)
    // tap e2 then e4 to play 1. e4
    await clickSquare(container, 'e2')
    await clickSquare(container, 'e4')
    expect(screen.getByText(/1\. e4/)).toBeInTheDocument()
  })

  it("shows the game-over modal after Fool's mate", async () => {
    const { container } = render(<ChessGame />)
    const moves: [string, string][] = [['f2','f3'], ['e7','e5'], ['g2','g4'], ['d8','h4']]
    for (const [from, to] of moves) {
      await clickSquare(container, from)
      await clickSquare(container, to)
    }
    expect(screen.getByText('Black wins')).toBeInTheDocument()
  })

  it('flips the board orientation manually', async () => {
    const { container } = render(<ChessGame />)
    await userEvent.selectOptions(screen.getByLabelText('Board flip'), 'manual')
    // White orientation: the a1 square sits bottom-left and shows file notation "a".
    expect(container.querySelector('[data-square="a1"]')).toHaveTextContent('a')
    await userEvent.click(screen.getByRole('button', { name: 'Flip board' }))
    // Black orientation: a1 moves to the top-right (no notation) and h8 is bottom-left.
    expect(container.querySelector('[data-square="a1"]')).not.toHaveTextContent('a')
    expect(container.querySelector('[data-square="h8"]')).toHaveTextContent('h')
  })
  it('resets to a new game when the time control changes', async () => {
    const { container } = render(<ChessGame />)
    const timeControl = screen.getByLabelText('Time control')
    expect(timeControl).toBeInTheDocument()

    await clickSquare(container, 'e2')
    await clickSquare(container, 'e4')
    expect(screen.getByText(/1\. e4/)).toBeInTheDocument()

    await userEvent.selectOptions(timeControl, '3')
    expect(screen.queryByText(/1\. e4/)).not.toBeInTheDocument()
  })
})

describe('reducer', () => {
  it('clears a pending promotion when a timeout occurs', () => {
    const state = { ...createInitialState({ minutes: 10 }), pendingPromotion: { from: 'e7', to: 'e8' } }
    const next = reducer(state, { type: 'timeout', color: 'w' })
    expect(next.status).toBe('timeout')
    expect(next.winner).toBe('b')
    expect(next.pendingPromotion).toBeNull()
  })
})
