import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Lobby from '../app/online/page'
import { useAuth } from '../hooks/useAuth'

vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }))

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/api')>()
  return { ...orig, createGame: vi.fn().mockResolvedValue({ id: 'game-1' }) }
})

const mockedUseAuth = vi.mocked(useAuth)

describe('Lobby', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset()
  })

  it('renders the create-game controls when signed in', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', email: null, displayName: 'Guest', isAnonymous: true },
      loading: false,
      login: vi.fn(), register: vi.fn(), guest: vi.fn(), logout: vi.fn(), getAccessToken: () => null,
    })
    render(<Lobby />)
    expect(screen.getByRole('button', { name: /create game/i })).toBeInTheDocument()
  })

  it('renders the auth forms for anonymous visitors', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      login: vi.fn(), register: vi.fn(), guest: vi.fn(), logout: vi.fn(), getAccessToken: () => null,
    })
    render(<Lobby />)
    expect(screen.getByText(/continue as guest/i)).toBeInTheDocument()
  })
})
