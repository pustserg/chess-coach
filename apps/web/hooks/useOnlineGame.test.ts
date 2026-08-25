import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnlineGame } from './useOnlineGame'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  sent: string[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onopen: (() => void) | null = null
  url: string
  constructor(url: string) { this.url = url; MockWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() {}
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
})
