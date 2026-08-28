import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    error: null,
    getBestMove: () => Promise.resolve('e2e4'),
    getEvaluation: () => Promise.resolve({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] }),
    newGame: vi.fn(),
  }),
}))

vi.mock('../lib/coach', () => ({
  streamCoachReply: vi.fn().mockResolvedValue(undefined),
}))

describe('ChessGame coach integration', () => {
  beforeEach(() => vi.useFakeTimers())
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
})
