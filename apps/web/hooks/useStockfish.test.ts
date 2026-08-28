import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStockfish } from './useStockfish'

class FakeWorker {
  static instances: FakeWorker[] = []
  postMessage = vi.fn()
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminate = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }
}

describe('useStockfish', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  it('does not spawn a worker when disabled', () => {
    renderHook(() => useStockfish(false))
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('spawns a worker, reports ready, and terminates on unmount', async () => {
    const { unmount, result } = renderHook(() => useStockfish(true))
    expect(FakeWorker.instances).toHaveLength(1)
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })
    expect(result.current.ready).toBe(true)

    unmount()
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('forwards options to the worker and resolves the move', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    let resolved: string | undefined
    const p = result.current.getBestMove('START_FEN', { level: 5, depth: 8 }).then((m) => {
      resolved = m
    })

    expect(worker.postMessage).toHaveBeenCalledWith('setoption name Skill Level value 5')
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 8')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove e2e4' })
    })
    await p
    expect(resolved).toBe('e2e4')
  })

  it('serializes concurrent getBestMove calls', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    const p1 = result.current.getBestMove('FEN1', { level: 1, depth: 2 })
    const p2 = result.current.getBestMove('FEN2', { level: 1, depth: 3 })

    expect(worker.postMessage).toHaveBeenCalledWith('go depth 2')
    expect(worker.postMessage).not.toHaveBeenCalledWith('go depth 3')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove e2e4' })
    })
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 3')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove d2d4' })
    })
    await expect(p1).resolves.toBe('e2e4')
    await expect(p2).resolves.toBe('d2d4')
  })

  it('sets error when the worker fails to load', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onerror!({})
    })

    expect(result.current.error).toBe('Engine unavailable')
  })

  it('rejects getBestMove when the engine is unavailable', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onerror!({})
    })

    await expect(
      result.current.getBestMove('START_FEN', { level: 5, depth: 8 }),
    ).rejects.toThrow('engine unavailable')
  })

  it('clears a timeout-only error when readyok arrives late', async () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = renderHook(() => useStockfish(true))
      const worker = FakeWorker.instances[0]

      act(() => {
        vi.advanceTimersByTime(20000)
      })
      expect(result.current.error).toBe('Engine unavailable')

      await act(async () => {
        worker.onmessage!({ data: 'readyok' })
      })
      expect(result.current.ready).toBe(true)
      expect(result.current.error).toBeNull()

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exposes getEvaluation that delegates to the engine', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })

    const evalPromise = result.current.getEvaluation('START_FEN', 16)
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3')

    await act(async () => {
      worker.onmessage!({ data: 'info depth 16 multipv 1 score cp 10 pv e2e4\nbestmove e2e4' })
    })
    const evaluation = await evalPromise
    expect(evaluation.scoreCp).toBe(10)
  })

  it('queues a getBestMove behind an in-flight getEvaluation instead of rejecting it', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })

    // The coach starts a deep analysis, then the bot's timer fires: the move
    // request must wait its turn, not be dropped.
    const evalPromise = result.current.getEvaluation('FEN1', 16)
    const movePromise = result.current.getBestMove('FEN2', { level: 1, depth: 3 })

    expect(worker.postMessage).toHaveBeenCalledWith('go depth 16')
    expect(worker.postMessage).not.toHaveBeenCalledWith('go depth 3')

    await act(async () => {
      worker.onmessage!({ data: 'info depth 16 multipv 1 score cp 10 pv e2e4\nbestmove e2e4' })
    })
    await expect(evalPromise).resolves.toMatchObject({ scoreCp: 10 })
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 3')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove d2d4' })
    })
    await expect(movePromise).resolves.toBe('d2d4')
  })

  it('queues a getEvaluation behind an in-flight getBestMove instead of rejecting it', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })

    const movePromise = result.current.getBestMove('FEN1', { level: 1, depth: 2 })
    const evalPromise = result.current.getEvaluation('FEN2', 16)

    expect(worker.postMessage).toHaveBeenCalledWith('go depth 2')
    expect(worker.postMessage).not.toHaveBeenCalledWith('setoption name MultiPV value 3')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove e2e4' })
    })
    await expect(movePromise).resolves.toBe('e2e4')
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3')

    await act(async () => {
      worker.onmessage!({ data: 'info depth 16 multipv 1 score cp 25 pv d2d4\nbestmove d2d4' })
    })
    await expect(evalPromise).resolves.toMatchObject({ scoreCp: 25 })
  })
})
