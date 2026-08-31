/**
 * Regression coverage for the shared-engine race that froze the game: the coach
 * drawer's depth-16 evaluation and the bot's move request go through the same
 * single-worker engine, and the engine rejects overlapping requests. These tests
 * drive the REAL useStockfish + createEngine + useBotOpponent code (only the Web
 * Worker is faked), so an overlap is exercised end to end.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBotOpponent } from './useBotOpponent'
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

// Stable identities: useBotOpponent's effect re-runs when these change.
const ENGINE_OPTIONS = { level: 10, depth: 12 }
const BOT_TO_MOVE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'
const EVAL_REPLY = 'info depth 16 multipv 1 score cp 10 pv e7e5\nbestmove e7e5'

function useCoachAndBot(onMove: (uci: string) => boolean) {
  const { getBestMove, getEvaluation } = useStockfish(true)
  const { thinking } = useBotOpponent({
    enabled: true,
    botColor: 'b',
    fen: BOT_TO_MOVE_FEN,
    turn: 'b',
    status: 'playing',
    pendingPromotion: false,
    engineOptions: ENGINE_OPTIONS,
    getBestMove,
    onMove,
  })
  return { getEvaluation, thinking }
}

describe('coach evaluation / bot move overlap on the shared engine', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('still plays the bot move when an evaluation is in flight when the bot timer fires', async () => {
    const onMove = vi.fn().mockReturnValue(true)
    const { result } = renderHook(() => useCoachAndBot(onMove))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })

    // The player moved with the drawer open: a depth-16 analysis starts first.
    let evalPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      evalPromise = result.current.getEvaluation(BOT_TO_MOVE_FEN, 16)
    })
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 16')

    // The bot's 300–800ms timer fires while that analysis is still running.
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(worker.postMessage).not.toHaveBeenCalledWith('go depth 12')
    expect(onMove).not.toHaveBeenCalled()

    // The analysis finishes; the queued move request runs next, with no extra
    // timers advanced — so this is the queue working, not the retry.
    await act(async () => {
      worker.onmessage!({ data: EVAL_REPLY })
    })
    await evalPromise
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 12')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove g8f6' })
    })
    expect(onMove).toHaveBeenCalledWith('g8f6')
  })

  it('resolves both requests when the bot request is queued first', async () => {
    const onMove = vi.fn().mockReturnValue(true)
    const { result } = renderHook(() => useCoachAndBot(onMove))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 12')

    let evalPromise: Promise<unknown> = Promise.resolve()
    act(() => {
      evalPromise = result.current.getEvaluation(BOT_TO_MOVE_FEN, 16)
    })
    expect(worker.postMessage).not.toHaveBeenCalledWith('setoption name MultiPV value 3')

    await act(async () => {
      worker.onmessage!({ data: 'bestmove g8f6' })
    })
    expect(onMove).toHaveBeenCalledWith('g8f6')

    await act(async () => {
      worker.onmessage!({ data: EVAL_REPLY })
    })
    await expect(evalPromise).resolves.toMatchObject({ scoreCp: 10 })
  })
})
