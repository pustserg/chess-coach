import type { EngineOptions, Evaluation } from './types'

export interface UciWorker {
  postMessage(message: string): void
  onmessage: ((event: { data: string }) => void) | null
  terminate(): void
}

export interface Engine {
  ready: Promise<void>
  getBestMove(fen: string, opts: EngineOptions): Promise<string>
  getEvaluation(fen: string, depth: number): Promise<Evaluation>
  newGame(): void
  terminate(): void
}

interface EvalLine {
  scoreCp: number | null
  scoreMate: number | null
  pv: string[]
}

function parseInfoLine(line: string, lines: Map<number, EvalLine>): void {
  const multipvMatch = line.match(/\bmultipv (\d+)/)
  const pvMatch = line.match(/ pv (.+)$/)
  if (!multipvMatch || !pvMatch) return
  const cpMatch = line.match(/score cp (-?\d+)/)
  const mateMatch = line.match(/score mate (-?\d+)/)
  lines.set(Number(multipvMatch[1]), {
    scoreCp: cpMatch ? Number(cpMatch[1]) : null,
    scoreMate: mateMatch ? Number(mateMatch[1]) : null,
    pv: pvMatch[1].trim().split(/\s+/),
  })
}

export function createEngine(worker: UciWorker): Engine {
  let readyResolve: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })

  let bestMoveResolve: ((move: string) => void) | null = null
  let evalResolve: ((evaluation: Evaluation) => void) | null = null
  let evalLines = new Map<number, EvalLine>()

  worker.onmessage = (event) => {
    const data = String(event.data ?? '')
    for (const rawLine of data.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      if (line === 'readyok') {
        readyResolve()
      } else if (line.startsWith('info') && evalResolve) {
        parseInfoLine(line, evalLines)
      } else if (line.startsWith('bestmove')) {
        const move = line.split(/\s+/)[1]
        if (move && bestMoveResolve) {
          bestMoveResolve(move)
          bestMoveResolve = null
        } else if (evalResolve) {
          const sorted = [...evalLines.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)
          const top = sorted[0]
          evalResolve({
            scoreCp: top?.scoreCp ?? null,
            scoreMate: top?.scoreMate ?? null,
            lines: sorted.map((v) => v.pv),
          })
          evalResolve = null
          evalLines = new Map()
        }
      }
    }
  }

  worker.postMessage('uci')
  worker.postMessage('isready')

  return {
    ready,
    getBestMove(fen, opts) {
      if (bestMoveResolve || evalResolve) {
        return Promise.reject(new Error('engine request already in flight'))
      }
      return new Promise<string>((resolve) => {
        bestMoveResolve = resolve
        worker.postMessage('setoption name UCI_LimitStrength value true')
        worker.postMessage(`setoption name Skill Level value ${opts.level}`)
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${opts.depth}`)
      })
    },
    getEvaluation(fen, depth) {
      if (bestMoveResolve || evalResolve) {
        return Promise.reject(new Error('engine request already in flight'))
      }
      const result = new Promise<Evaluation>((resolve) => {
        evalResolve = resolve
        evalLines = new Map()
        worker.postMessage('setoption name MultiPV value 3')
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${depth}`)
      })
      return result.finally(() => {
        worker.postMessage('setoption name MultiPV value 1')
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
