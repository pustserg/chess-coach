import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, getTokens, setTokens, wsUrl } from './api'

describe('apiFetch', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('POSTs JSON and returns parsed body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const res = await apiFetch('/x', { method: 'POST', body: JSON.stringify({ a: 1 }) })
    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/x',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('attaches the bearer token when provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    )
    await apiFetch('/x', {}, 'tok123')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/x',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok123' }) }),
    )
  })

  it('throws on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }))
    await expect(apiFetch('/x', {})).rejects.toThrow()
  })
})

describe('tokens', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips tokens', () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    expect(getTokens()).toEqual({ access_token: 'a', refresh_token: 'r' })
  })
})

describe('wsUrl', () => {
  it('builds a websocket url with token', () => {
    expect(wsUrl('game-1', 'tok')).toBe('ws://localhost:8000/games/game-1/ws?token=tok')
  })
})
