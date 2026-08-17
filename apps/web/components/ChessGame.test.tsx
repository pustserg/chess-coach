import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChessGame from './ChessGame'

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
})
