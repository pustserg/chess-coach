import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameStatus, PlayerColor } from '../lib/types'
import { useBotOpponent } from './useBotOpponent'

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    botColor: 'w' as PlayerColor,
    fen: 'START',
    turn: 'w' as PlayerColor,
    status: 'playing' as GameStatus,
    pendingPromotion: false,
    engineOptions: { level: 10, depth: 12 },
    getBestMove: vi.fn().mockResolvedValue('e2e4'),
    onMove: vi.fn(),
    ...overrides,
  }
}

describe('useBotOpponent', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('requests and dispatches a move on the bot turn', async () => {
    const args = makeArgs()
    renderHook(() => useBotOpponent(args))
    expect(args.getBestMove).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(args.getBestMove).toHaveBeenCalledWith('START', { level: 10, depth: 12 })
    expect(args.onMove).toHaveBeenCalledWith('e2e4')
  })

  it('does nothing on the human turn', async () => {
    const args = makeArgs({ turn: 'b' })
    renderHook(() => useBotOpponent(args))
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(args.getBestMove).not.toHaveBeenCalled()
  })

  it('does nothing on a terminal status', async () => {
    const args = makeArgs({ status: 'checkmate' })
    renderHook(() => useBotOpponent(args))
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(args.getBestMove).not.toHaveBeenCalled()
  })

  it('does nothing while a promotion is pending', async () => {
    const args = makeArgs({ pendingPromotion: true })
    renderHook(() => useBotOpponent(args))
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(args.getBestMove).not.toHaveBeenCalled()
  })

  it('reports thinking only on the bot turn', () => {
    const args = makeArgs()
    const { result, rerender } = renderHook((a) => useBotOpponent(a), { initialProps: args })
    expect(result.current.thinking).toBe(true)
    rerender({ ...args, turn: 'b' })
    expect(result.current.thinking).toBe(false)
  })
})
