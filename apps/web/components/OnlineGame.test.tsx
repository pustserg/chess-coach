import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OnlineGame from './OnlineGame'

const useOnlineGame = vi.hoisted(() => vi.fn())
const useAuth = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useOnlineGame', () => ({
  useOnlineGame,
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth,
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

function setAuth({ user, loading, token }: { user: unknown; loading: boolean; token: string | null }) {
  useAuth.mockReturnValue({
    user,
    loading,
    guest: vi.fn(),
    getAccessToken: () => token,
  })
}

describe('OnlineGame', () => {
  beforeEach(() => {
    setState()
    setAuth({ user: { id: '1', displayName: 'Ann' }, loading: false, token: 'a' })
  })

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

  it('shows Authenticating… and does not render the board without a token', () => {
    setAuth({ user: null, loading: false, token: null })
    render(<OnlineGame gameId="g1" />)
    expect(screen.getByText('Authenticating…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resign/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('renders the board once a token is present', () => {
    setAuth({ user: null, loading: false, token: 'a' })
    render(<OnlineGame gameId="g1" />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
