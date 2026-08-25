import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'
import * as api from '../lib/api'

describe('useAuth', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('hydrates a user from existing tokens', async () => {
    localStorage.setItem('chess-trainer-tokens', JSON.stringify({ access_token: 'a', refresh_token: 'r' }))
    vi.spyOn(api, 'getMe').mockResolvedValue({ id: '1', email: 'a@b.co', displayName: 'Ann', isAnonymous: false })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).toEqual({ id: '1', email: 'a@b.co', displayName: 'Ann', isAnonymous: false }))
  })

  it('login stores tokens and sets user', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({
      user: { id: '1', email: 'a@b.co', displayName: 'Ann', isAnonymous: false },
      tokens: { access_token: 'a', refresh_token: 'r' },
    })
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.login('a@b.co', 'pw') })
    expect(result.current.user?.displayName).toBe('Ann')
    expect(api.getTokens()).toEqual({ access_token: 'a', refresh_token: 'r' })
  })

  it('guest creates an anonymous session', async () => {
    vi.spyOn(api, 'anonymous').mockResolvedValue({
      user: { id: 'g', email: null, displayName: 'Guest', isAnonymous: true },
      tokens: { access_token: 'a', refresh_token: 'r' },
    })
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.guest() })
    expect(result.current.user?.isAnonymous).toBe(true)
  })

  it('logout clears user and tokens', async () => {
    vi.spyOn(api, 'anonymous').mockResolvedValue({
      user: { id: 'g', email: null, displayName: 'Guest', isAnonymous: true },
      tokens: { access_token: 'a', refresh_token: 'r' },
    })
    const { result } = renderHook(() => useAuth())
    await act(async () => { await result.current.guest() })
    act(() => result.current.logout())
    expect(result.current.user).toBeNull()
    expect(api.getTokens()).toBeNull()
  })
})
