import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

// Simulates the Stockfish worker's request-id-less UCI channel misattributing
// a late reply to a later request: the first resolved move is illegal for
// the current position (as if it were meant for a position already left
// behind), and only the second call returns the actual reply for 1. e4.
const { getBestMove } = vi.hoisted(() => ({
  getBestMove: vi.fn()
    .mockResolvedValueOnce('e2e4') // illegal: black to move, e2 is empty
    .mockResolvedValue('e7e5'),
}))

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    error: null,
    getBestMove,
    getEvaluation: vi.fn(),
    newGame: vi.fn(),
  }),
}))

function clickSquare(container: HTMLElement, square: string) {
  const el = container.querySelector<HTMLElement>(`[data-square="${square}"]`)
  expect(el).not.toBeNull()
  fireEvent.click(el!)
}

describe('ChessGame stale engine reply', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getBestMove.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('retries instead of silently dropping a resolved-but-illegal bot move', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))

    // Human is White: play 1. e4
    clickSquare(container, 'e2')
    clickSquare(container, 'e4')

    // First engine reply resolves but is illegal for the current (black to
    // move) position — applyBotMove no-ops, so the retry must kick in rather
    // than leaving the bot's turn hanging.
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(getBestMove).toHaveBeenCalledTimes(1)
    expect(screen.getByText('1. e4')).toBeInTheDocument()
    expect(screen.queryByText('1. e4 e5')).not.toBeInTheDocument()

    // Bounded retry fires the second request, which resolves with a legal move.
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(getBestMove).toHaveBeenCalledTimes(2)
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()
  })
})
