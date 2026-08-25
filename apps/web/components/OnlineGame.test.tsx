import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnlineGame from './OnlineGame'

const useOnlineGame = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useOnlineGame', () => ({
  useOnlineGame,
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', displayName: 'Ann' },
    loading: false,
    guest: vi.fn(),
    getAccessToken: () => 'a',
  }),
}))

const baseState = {
  status: 'playing',
  turn: 'w',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  sanHistory: [],
  lastMove: null,
  check: false,
  checkSquare: null,
  clocks: { w_ms: 300000, b_ms: 300000 },
  white: { id: '1', displayName: 'Ann', connected: true },
  black: { id: '2', displayName: 'Bob', connected: true },
  youAre: 'w',
  captured: { w: [], b: [] },
  result: null,
  drawOfferedBy: null,
}

function setState(overrides: Record<string, unknown> = {}) {
  useOnlineGame.mockReturnValue({
    state: { ...baseState, ...overrides },
    connected: true,
    sendMove: vi.fn(),
    resign: vi.fn(),
    offerDraw: vi.fn(),
    acceptDraw: vi.fn(),
    declineDraw: vi.fn(),
  })
}

describe('OnlineGame', () => {
  beforeEach(() => setState())

  it('renders player names and draw/resign controls', () => {
    render(<OnlineGame gameId="g1" />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resign/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /offer draw/i })).toBeInTheDocument()
  })

  it('maps a resignation result to the game-over modal', () => {
    setState({ result: { result: 'black', reason: 'resignation' } })
    render(<OnlineGame gameId="g1" />)
    expect(screen.getByText('Black wins')).toBeInTheDocument()
    expect(screen.getByText('Resignation')).toBeInTheDocument()
  })

  it('maps an agreed-draw result to a draw', () => {
    setState({ result: { result: 'draw', reason: 'agreed-draw' } })
    render(<OnlineGame gameId="g1" />)
    expect(screen.getByText('Draw')).toBeInTheDocument()
    expect(screen.getByText('Agreed draw')).toBeInTheDocument()
  })
})
