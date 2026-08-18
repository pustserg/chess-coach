import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

// Mock the engine hook: choose a legal move for whichever side is to move.
vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    getBestMove: (fen: string) => Promise.resolve(fen.split(' ')[1] === 'w' ? 'e2e4' : 'e7e5'),
    newGame: vi.fn(),
  }),
}))

function clickSquare(container: HTMLElement, square: string) {
  const el = container.querySelector<HTMLElement>(`[data-square="${square}"]`)
  expect(el).not.toBeNull()
  fireEvent.click(el!)
}

describe('ChessGame vs computer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('defaults to pass-and-play', () => {
    render(<ChessGame />)
    expect(screen.getByText('White')).toBeInTheDocument()
    expect(screen.getByText('Black')).toBeInTheDocument()
  })

  it('shows You/Computer labels and side select in vs-computer mode', () => {
    render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Computer')).toBeInTheDocument()
    expect(screen.getByLabelText('You play')).toBeInTheDocument()
  })

  it('lets the bot move first when the human plays black', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    fireEvent.change(screen.getByLabelText('You play'), { target: { value: 'black' } })

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(screen.getByText('1. e4')).toBeInTheDocument()
  })

  it('reverts a full move-pair on undo', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))

    // Human is White: play 1. e4
    clickSquare(container, 'e2')
    clickSquare(container, 'e4')

    // Bot replies 1... e5 after the delay
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()

    // Undo reverts both plies
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText('1. e4 e5')).not.toBeInTheDocument()
  })
})
