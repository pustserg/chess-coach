import { describe, expect, it, vi } from 'vitest'
import { createEngine } from './stockfish'
import type { UciWorker } from './stockfish'

function makeWorker(): UciWorker {
  return {
    postMessage: vi.fn(),
    onmessage: null,
    terminate: vi.fn(),
  }
}

describe('createEngine', () => {
  it('sends uci and isready on init and resolves ready on readyok', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    expect(worker.postMessage).toHaveBeenCalledWith('uci')
    expect(worker.postMessage).toHaveBeenCalledWith('isready')

    const readyPromise = engine.ready
    worker.onmessage!({ data: 'readyok' })
    await expect(readyPromise).resolves.toBeUndefined()
  })

  it('emits skill level and depth options and resolves the bestmove', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const movePromise = engine.getBestMove(fen, { level: 10, depth: 12 })
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name UCI_LimitStrength value true')
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name Skill Level value 10')
    expect(worker.postMessage).toHaveBeenCalledWith(`position fen ${fen}`)
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 12')

    worker.onmessage!({ data: 'bestmove e2e4 ponder e7e5' })
    await expect(movePromise).resolves.toBe('e2e4')
  })

  it('sends stop then ucinewgame on newGame', () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    engine.newGame()
    expect(worker.postMessage).toHaveBeenCalledWith('stop')
    expect(worker.postMessage).toHaveBeenCalledWith('ucinewgame')
  })

  it('terminates the worker', () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    engine.terminate()
    expect(worker.terminate).toHaveBeenCalled()
  })
})
