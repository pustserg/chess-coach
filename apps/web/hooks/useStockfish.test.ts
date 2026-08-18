import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStockfish } from './useStockfish'

class FakeWorker {
  static instances: FakeWorker[] = []
  postMessage = vi.fn()
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminate = vi.fn()
  constructor(_url: string) {
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
})
