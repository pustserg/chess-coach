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
    onMove: vi.fn().mockReturnValue(true),
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

  it('retries once when the engine request is rejected', async () => {
    const getBestMove = vi.fn()
      .mockRejectedValueOnce(new Error('engine request already in flight'))
      .mockResolvedValue('e2e4')
    const args = makeArgs({ getBestMove })
    renderHook(() => useBotOpponent(args))

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(getBestMove).toHaveBeenCalledTimes(1)
    expect(args.onMove).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(500) })
    expect(getBestMove).toHaveBeenCalledTimes(2)
    expect(args.onMove).toHaveBeenCalledWith('e2e4')
  })

  it('retries once when the move resolves but onMove reports it did not apply', async () => {
    // Simulates a stale worker reply resolving a later request with a move
    // that's illegal for the current position — onMove (via applyBotMove)
    // reports false instead of the promise rejecting.
    const onMove = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true)
    const args = makeArgs({ onMove })
    renderHook(() => useBotOpponent(args))

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(args.getBestMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('e2e4')
    expect(onMove).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(500) })
    expect(args.getBestMove).toHaveBeenCalledTimes(2)
    expect(onMove).toHaveBeenCalledTimes(2)
    expect(onMove).toHaveBeenLastCalledWith('e2e4')
  })

  it('gives up after one retry rather than looping', async () => {
    const getBestMove = vi.fn().mockRejectedValue(new Error('engine unavailable'))
    const args = makeArgs({ getBestMove })
    renderHook(() => useBotOpponent(args))

    await act(async () => { vi.advanceTimersByTime(800) })
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(getBestMove).toHaveBeenCalledTimes(2)
    expect(args.onMove).not.toHaveBeenCalled()
  })

  it('does not retry after the effect is torn down', async () => {
    const getBestMove = vi.fn().mockRejectedValue(new Error('engine unavailable'))
    const args = makeArgs({ getBestMove })
    const { unmount } = renderHook(() => useBotOpponent(args))

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(getBestMove).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(getBestMove).toHaveBeenCalledTimes(1)
  })

  it('reports thinking only on the bot turn', () => {
    const args = makeArgs()
    const { result, rerender } = renderHook((a) => useBotOpponent(a), { initialProps: args })
    expect(result.current.thinking).toBe(true)
    rerender({ ...args, turn: 'b' })
    expect(result.current.thinking).toBe(false)
  })
})
