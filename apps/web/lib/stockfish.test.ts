import { describe, expect, it, vi } from 'vitest'
import { createEngine } from './stockfish'
import type { UciWorker } from './stockfish'
import type { Evaluation } from './types'

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

  it('rejects a second concurrent getBestMove while one is in flight', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const first = engine.getBestMove(fen, { level: 10, depth: 12 })
    await expect(engine.getBestMove(fen, { level: 10, depth: 12 })).rejects.toThrow(
      'engine request already in flight',
    )

    worker.onmessage!({ data: 'bestmove e2e4' })
    await expect(first).resolves.toBe('e2e4')
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

describe('createEngine.getEvaluation', () => {
  it('parses multipv info lines into a sorted top-3 evaluation', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const evalPromise = engine.getEvaluation(fen, 16)
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3')
    expect(worker.postMessage).toHaveBeenCalledWith(`position fen ${fen}`)
    expect(worker.postMessage).toHaveBeenCalledWith('go depth 16')

    worker.onmessage!({
      data: [
        'info depth 16 multipv 2 score cp 10 pv d2d4 d7d5',
        'info depth 16 multipv 1 score cp 35 pv g1f3 g8f6 d2d4',
        'info depth 16 multipv 3 score cp -5 pv e2e3 e7e5',
        'bestmove g1f3 ponder g8f6',
      ].join('\n'),
    })

    const evaluation: Evaluation = await evalPromise
    expect(evaluation.scoreCp).toBe(35)
    expect(evaluation.scoreMate).toBeNull()
    expect(evaluation.lines).toEqual([
      ['g1f3', 'g8f6', 'd2d4'],
      ['d2d4', 'd7d5'],
      ['e2e3', 'e7e5'],
    ])
  })

  it('parses a mate score', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const evalPromise = engine.getEvaluation(fen, 16)
    worker.onmessage!({
      data: 'info depth 16 multipv 1 score mate 3 pv h5f7\nbestmove h5f7',
    })

    const evaluation = await evalPromise
    expect(evaluation.scoreMate).toBe(3)
    expect(evaluation.scoreCp).toBeNull()
  })

  it('resets MultiPV to 1 after resolving so getBestMove is unaffected', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const evalPromise = engine.getEvaluation(fen, 16)
    worker.onmessage!({ data: 'info depth 16 multipv 1 score cp 10 pv e2e4\nbestmove e2e4' })
    await evalPromise

    expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 1')
  })

  it('rejects a concurrent getEvaluation while a getBestMove is in flight', async () => {
    const worker = makeWorker()
    const engine = createEngine(worker)
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

    const movePromise = engine.getBestMove(fen, { level: 10, depth: 12 })
    await expect(engine.getEvaluation(fen, 16)).rejects.toThrow('engine request already in flight')

    worker.onmessage!({ data: 'bestmove e2e4' })
    await movePromise
  })
})
