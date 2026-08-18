import type { EngineOptions } from './types'

export interface UciWorker {
  postMessage(message: string): void
  onmessage: ((event: { data: string }) => void) | null
  terminate(): void
}

export interface Engine {
  ready: Promise<void>
  getBestMove(fen: string, opts: EngineOptions): Promise<string>
  newGame(): void
  terminate(): void
}

export function createEngine(worker: UciWorker): Engine {
  let readyResolve: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })

  let bestMoveResolve: ((move: string) => void) | null = null

  worker.onmessage = (event) => {
    const data = String(event.data ?? '')
    for (const rawLine of data.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      if (line === 'readyok') readyResolve()
      else if (line.startsWith('bestmove')) {
        const move = line.split(/\s+/)[1]
        if (move && bestMoveResolve) {
          bestMoveResolve(move)
          bestMoveResolve = null
        }
      }
    }
  }

  worker.postMessage('uci')
  worker.postMessage('isready')

  return {
    ready,
    getBestMove(fen, opts) {
      return new Promise<string>((resolve) => {
        bestMoveResolve = resolve
        worker.postMessage('setoption name UCI_LimitStrength value true')
        worker.postMessage(`setoption name Skill Level value ${opts.level}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${opts.depth}`)
      })
    },
    newGame() {
      worker.postMessage('stop')
      worker.postMessage('ucinewgame')
    },
    terminate() {
      worker.terminate()
    },
  }
}
