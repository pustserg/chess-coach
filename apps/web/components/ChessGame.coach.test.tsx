import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

const { getBestMove, getEvaluation } = vi.hoisted(() => ({
  getBestMove: vi.fn(() => Promise.resolve('e7e5')),
  getEvaluation: vi.fn(() =>
    Promise.resolve({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] }),
  ),
}))

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    error: null,
    getBestMove,
    getEvaluation,
    newGame: vi.fn(),
  }),
}))

vi.mock('../lib/coach', () => ({
  streamCoachReply: vi.fn().mockResolvedValue(undefined),
}))

function clickSquare(container: HTMLElement, square: string) {
  const el = container.querySelector<HTMLElement>(`[data-square="${square}"]`)
  expect(el).not.toBeNull()
  fireEvent.click(el!)
}

describe('ChessGame coach integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getBestMove.mockClear()
    getEvaluation.mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('only shows Ask Coach in vs-computer mode', () => {
    render(<ChessGame />)
    expect(screen.queryByRole('button', { name: 'Ask Coach' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(screen.getByRole('button', { name: 'Ask Coach' })).toBeInTheDocument()
  })

  it('opens the drawer and runs the evaluation on click', async () => {
    render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Coach' }))

    expect(await screen.findByRole('heading', { name: 'Ask Coach' })).toBeInTheDocument()
    await act(async () => {})
    expect(screen.getByLabelText('Ask the coach')).toBeEnabled()
  })

  it('closes the drawer and starts no evaluation once the bot is to move', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Coach' }))
    expect(await screen.findByRole('heading', { name: 'Ask Coach' })).toBeInTheDocument()
    await act(async () => {})
    const callsWhileOpen = getEvaluation.mock.calls.length
    expect(callsWhileOpen).toBeGreaterThan(0)

    // The human plays 1. e4 with the drawer open: the drawer must go away
    // instead of firing a depth-16 evaluation for the bot-to-move position.
    clickSquare(container, 'e2')
    clickSquare(container, 'e4')
    expect(screen.queryByRole('heading', { name: 'Ask Coach' })).not.toBeInTheDocument()
    await act(async () => {})
    expect(getEvaluation).toHaveBeenCalledTimes(callsWhileOpen)

    // ...and it stays closed after the bot replies, rather than popping back
    // open and evaluating again.
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ask Coach' })).not.toBeInTheDocument()
    expect(getEvaluation).toHaveBeenCalledTimes(callsWhileOpen)
  })
})
