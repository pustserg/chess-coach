import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refresh, setTokens } from '../lib/api'
import { useOnlineGame } from './useOnlineGame'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, refresh: vi.fn(), setTokens: vi.fn() }
})

const refreshMock = vi.mocked(refresh)
const setTokensMock = vi.mocked(setTokens)

class MockWebSocket {
  static instances: MockWebSocket[] = []
  sent: string[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onopen: (() => void) | null = null
  url: string
  closed = false
  constructor(url: string) { this.url = url; MockWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.closed = true; this.onclose?.() }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
}

const stateMsg = {
  type: 'state', status: 'playing', turn: 'w', fen: 'start', san_history: ['e4'],
  last_move: { from: 'e2', to: 'e4' }, check: false, check_square: null,
  clocks: { w_ms: 300000, b_ms: 300000 },
  white: { id: '1', display_name: 'Ann', connected: true },
  black: { id: '2', display_name: 'Bob', connected: true },
  you_are: 'w', captured: { w: [], b: [] }, result: null, draw_offered_by: null,
}

describe('useOnlineGame', () => {
  beforeEach(() => {
    localStorage.setItem('chess-trainer-tokens', JSON.stringify({ access_token: 'a', refresh_token: 'r' }))
    refreshMock.mockReset()
    setTokensMock.mockReset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })
  afterEach(() => { MockWebSocket.instances = []; vi.unstubAllGlobals(); localStorage.clear() })

  it('connects and parses authoritative state', async () => {
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    expect(ws.url).toContain('/games/g1/ws?token=a')
    act(() => ws.emit(stateMsg))
    await waitFor(() => expect(result.current.state?.fen).toBe('start'))
    expect(result.current.state?.youAre).toBe('w')
  })

  it('sends a move intent', async () => {
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.emit(stateMsg))
    await waitFor(() => expect(result.current.state).not.toBeNull())
    act(() => result.current.sendMove('e2', 'e4'))
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'move', from: 'e2', to: 'e4' })
  })

  it('sends resign and draw actions', async () => {
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.emit(stateMsg))
    await waitFor(() => expect(result.current.state).not.toBeNull())
    act(() => result.current.resign())
    act(() => result.current.offerDraw())
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'resign' })
    expect(JSON.parse(ws.sent[1])).toEqual({ type: 'offer-draw' })
  })

  it('surfaces move-rejected as a transient lastError, cleared on the next state', async () => {
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.emit({ type: 'move-rejected', reason: 'illegal' }))
    expect(result.current.lastError).toBe('Move rejected: illegal')
    act(() => ws.emit(stateMsg))
    expect(result.current.lastError).toBeNull()
  })

  it('surfaces a generic server error as a transient lastError', async () => {
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]
    act(() => ws.emit({ type: 'error', reason: 'game-full' }))
    expect(result.current.lastError).toBe('game-full')
  })

  it('refreshes the access token on unauthorized and reconnects with the fresh token', async () => {
    refreshMock.mockResolvedValue({
      user: { id: 'u', email: null, displayName: 'Ann', isAnonymous: true },
      tokens: { access_token: 'new-a', refresh_token: 'new-r' },
    })
    setTokensMock.mockImplementation((t) => {
      localStorage.setItem('chess-trainer-tokens', JSON.stringify(t))
    })

    renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]

    act(() => ws.emit({ type: 'error', reason: 'unauthorized' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith('r'))
    await waitFor(() => expect(setTokensMock).toHaveBeenCalledWith({ access_token: 'new-a', refresh_token: 'new-r' }))
    expect(ws.closed).toBe(true)

    // The reconnect path re-reads the refreshed token.
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(2), { timeout: 3000 })
    expect(MockWebSocket.instances[1].url).toContain('token=new-a')
  })

  it('stops reconnecting and exposes a terminal error when refresh fails', async () => {
    refreshMock.mockRejectedValue(new Error('refresh expired'))
    const { result } = renderHook(() => useOnlineGame('g1'))
    await waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
    const ws = MockWebSocket.instances[0]

    act(() => ws.emit({ type: 'error', reason: 'unauthorized' }))
    await waitFor(() => expect(result.current.error).toBe('Your session has expired. Please sign in again.'))
    expect(ws.closed).toBe(true)

    // No further connection attempts are scheduled after a failed refresh.
    await new Promise((r) => setTimeout(r, 1600))
    expect(MockWebSocket.instances.length).toBe(1)
  })
})
