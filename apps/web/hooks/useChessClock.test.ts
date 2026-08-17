import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChessClock } from './useChessClock'

describe('useChessClock', () => {
  beforeEach(() => vi.useFakeTimers())

  it('counts down the active player only', () => {
    const onTimeout = vi.fn()
    const { result } = renderHook(() => useChessClock('w', 'playing', { minutes: 5 }, onTimeout))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.clocks.w).toBe(5 * 60_000 - 1000)
    expect(result.current.clocks.b).toBe(5 * 60_000)
  })

  it('calls onTimeout when the active clock reaches zero', () => {
    const onTimeout = vi.fn()
    renderHook(() => useChessClock('w', 'playing', { minutes: 0.001 }, onTimeout))
    act(() => vi.advanceTimersByTime(200))
    expect(onTimeout).toHaveBeenCalledWith('w')
  })

  it('does not tick on a terminal status', () => {
    const onTimeout = vi.fn()
    const { result } = renderHook(() => useChessClock('w', 'checkmate', { minutes: 5 }, onTimeout))
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.clocks.w).toBe(5 * 60_000)
  })
})
