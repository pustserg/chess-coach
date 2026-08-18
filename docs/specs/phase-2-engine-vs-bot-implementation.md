# Phase 2 — Engine Integration & Play vs. Bot: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side Stockfish WASM opponent ("Play vs. Computer" mode) to the existing hotseat app, with a mode selector, side selection, preset + advanced difficulty controls, and full visual highlights.

**Architecture:** Board state (`GameState`) and the pure rules layer (`lib/chess.ts`) stay as in Phase 1. A new `GameConfig` (mode/side/difficulty) lives in React state. A Web Worker runs the vendored Stockfish 18 lite single-threaded build, wrapped by `lib/stockfish.ts` + `useStockfish`; `useBotOpponent` drives bot turns.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS, chess.js 1.4, react-chessboard 5.12, Stockfish 18 lite single-threaded (vendored), Vitest 4 + @testing-library/react 16 + jsdom, pnpm 10.x.

## Global Constraints

- pnpm is the package manager; never use npm/yarn.
- Conventional Commits; one commit per task.
- chess.js is the only source of move legality — never hand-roll rules.
- Stockfish runs client-side in a Web Worker using the **lite single-threaded** build; no `SharedArrayBuffer`/COOP/COEP.
- Stockfish's `Skill Level` takes effect only when `UCI_LimitStrength true` is sent first.
- Mobile-first: game content constrained to `max-w-md`.
- No persistence (no localStorage, no DB).
- TDD: write the failing test, watch it fail, implement, watch it pass, then commit.
- Run tests from `apps/web` with `pnpm test` (vitest run). Run `pnpm test <path>` for a single file.
- Run the full build + lint once at the end (not per task).

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/web/public/engine/stockfish-18-lite-single.js` + `.wasm` | vendored engine (downloaded in Task 2) |
| `apps/web/lib/types.ts` | `GameConfig`, `GameMode`, `SideChoice`, `PlayerSide`, `DifficultyPreset`, `EngineOptions`, `DIFFICULTY_PRESETS`, `resolveEngineOptions`, `sideToColor` |
| `apps/web/lib/stockfish.ts` | `createEngine` Web Worker UCI wrapper |
| `apps/web/hooks/useStockfish.ts` | worker lifecycle, `ready`, serialized `getBestMove`, `newGame` |
| `apps/web/hooks/useBotOpponent.ts` | drives bot turns (delay + request + dispatch), exposes `thinking` |
| `apps/web/components/ModeSelector.tsx` | "Pass & Play" / "Play vs. Computer" segmented control |
| `apps/web/components/DifficultyControl.tsx` | preset select + "Advanced" sliders |
| `apps/web/components/ChessGame.tsx` | orchestrator (rewired for mode/side/bot/highlights) |

---

### Task 1: Game config types

**Files:**
- Modify: `apps/web/lib/types.ts` (append)
- Test: `apps/web/lib/types.test.ts` (create)

**Interfaces:**
- Consumes: `PlayerColor` (already in `types.ts`).
- Produces: `GameMode`, `SideChoice`, `PlayerSide`, `DifficultyPreset`, `EngineOptions`, `GameConfig`, `DIFFICULTY_PRESETS`, `resolveEngineOptions`, `sideToColor`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DIFFICULTY_PRESETS, resolveEngineOptions, sideToColor } from './types'
import type { GameConfig } from './types'

const base: GameConfig = {
  mode: 'vs-computer',
  side: 'white',
  difficulty: 'casual',
  custom: null,
}

describe('resolveEngineOptions', () => {
  it('returns the preset options when custom is null', () => {
    expect(resolveEngineOptions(base)).toBe(DIFFICULTY_PRESETS.casual)
  })

  it('returns custom options when set', () => {
    const config: GameConfig = { ...base, custom: { level: 3, depth: 4 } }
    expect(resolveEngineOptions(config)).toEqual({ level: 3, depth: 4 })
  })
})

describe('sideToColor', () => {
  it('maps white to w and black to b', () => {
    expect(sideToColor('white')).toBe('w')
    expect(sideToColor('black')).toBe('b')
  })
})

describe('DIFFICULTY_PRESETS', () => {
  it('covers all five presets with in-range level and depth', () => {
    expect(Object.keys(DIFFICULTY_PRESETS).sort()).toEqual(
      ['advanced', 'beginner', 'casual', 'expert', 'intermediate'].sort(),
    )
    for (const o of Object.values(DIFFICULTY_PRESETS)) {
      expect(o.level).toBeGreaterThanOrEqual(0)
      expect(o.level).toBeLessThanOrEqual(20)
      expect(o.depth).toBeGreaterThanOrEqual(1)
      expect(o.depth).toBeLessThanOrEqual(20)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/types.test.ts`
Expected: FAIL — `./types` has no `resolveEngineOptions`/`sideToColor`/`DIFFICULTY_PRESETS` exports.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/types.ts`:

```ts
export type GameMode = 'pass-and-play' | 'vs-computer'
export type SideChoice = 'white' | 'black' | 'random'
export type PlayerSide = 'white' | 'black'
export type DifficultyPreset = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert'
export interface EngineOptions { level: number; depth: number }
export interface GameConfig {
  mode: GameMode
  side: SideChoice
  difficulty: DifficultyPreset
  custom: { level: number; depth: number } | null
}

export const DIFFICULTY_PRESETS: Record<DifficultyPreset, EngineOptions> = {
  beginner: { level: 1, depth: 2 },
  casual: { level: 5, depth: 8 },
  intermediate: { level: 10, depth: 12 },
  advanced: { level: 15, depth: 16 },
  expert: { level: 20, depth: 20 },
}

export function resolveEngineOptions(config: GameConfig): EngineOptions {
  return config.custom ?? DIFFICULTY_PRESETS[config.difficulty]
}

export function sideToColor(side: PlayerSide): PlayerColor {
  return side === 'white' ? 'w' : 'b'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/types.test.ts
git commit -m "feat: add game config types"
```

---

### Task 2: Engine assets + worker wrapper

**Files:**
- Create: `apps/web/public/engine/stockfish-18-lite-single.js` (downloaded)
- Create: `apps/web/public/engine/stockfish-18-lite-single.wasm` (downloaded)
- Create: `apps/web/lib/stockfish.ts`
- Test: `apps/web/lib/stockfish.test.ts`

**Interfaces:**
- Consumes: `EngineOptions` from `../lib/types` (Task 1).
- Produces: `UciWorker`, `Engine`, `createEngine(worker: UciWorker): Engine`.

- [ ] **Step 1: Vendor the engine files**

```bash
mkdir -p apps/web/public/engine
curl -fL -o apps/web/public/engine/stockfish-18-lite-single.js \
  https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.js
curl -fL -o apps/web/public/engine/stockfish-18-lite-single.wasm \
  https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.wasm
```

Verify the assets are non-trivial (the `.wasm` is ~7MB):

```bash
ls -lh apps/web/public/engine/
```

Expected: both files present; `.wasm` on the order of megabytes. If either URL 404s, list the release assets with `read https://github.com/nmrugg/stockfish.js/releases` and use the exact filenames for the `lite` single-threaded flavor.

- [ ] **Step 2: Write the failing test**

Create `apps/web/lib/stockfish.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/stockfish.test.ts`
Expected: FAIL — module `./stockfish` not found.

- [ ] **Step 4: Implement**

Create `apps/web/lib/stockfish.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/stockfish.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/engine apps/web/lib/stockfish.ts apps/web/lib/stockfish.test.ts
git commit -m "feat: add stockfish worker wrapper"
```

---

### Task 3: Bot move and multi-ply undo

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `applyBotMove`, `undoPlies`)
- Test: `apps/web/lib/chess.test.ts` (append; update import)

**Interfaces:**
- Consumes: existing `commitMove` (private in `chess.ts`), `undo`, `Chess`, `PromotionPiece`.
- Produces: `applyBotMove(state: GameState, uci: string): GameState`, `undoPlies(state: GameState, plies: number): GameState`.

- [ ] **Step 1: Write the failing tests**

Update the import on line 3 of `apps/web/lib/chess.test.ts` to add `applyBotMove, undoPlies`:

```ts
import { applyBotMove, applyMove, createInitialState, getLegalTargetSquares, getStatus, promote, undo, undoPlies } from './chess'
```

Append to the end of `apps/web/lib/chess.test.ts`:

```ts
describe('applyBotMove', () => {
  it('commits a plain UCI move', () => {
    const state = createInitialState({ minutes: 10 })
    const next = applyBotMove(state, 'e2e4')
    expect(next.history).toEqual(['e4'])
    expect(next.turn).toBe('b')
  })

  it('commits a capture and records the captured piece', () => {
    // Position after 1. e4 d5: white pawn e4 captures d5.
    const state = {
      ...createInitialState({ minutes: 10 }),
      fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    }
    const next = applyBotMove(state, 'e4d5')
    expect(next.history).toEqual(['exd5'])
    expect(next.captured.w).toEqual(['p'])
  })

  it('commits a promotion without setting pendingPromotion', () => {
    const state = {
      ...createInitialState({ minutes: 10 }),
      fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
    }
    const next = applyBotMove(state, 'a7a8q')
    expect(next.pendingPromotion).toBeNull()
    expect(next.history).toEqual(['a8=Q'])
  })

  it('ignores a malformed UCI move', () => {
    const state = createInitialState({ minutes: 10 })
    expect(applyBotMove(state, 'e2')).toBe(state)
  })
})

describe('undoPlies', () => {
  it('reverts multiple plies', () => {
    let state = createInitialState({ minutes: 10 })
    state = applyMove(state, 'e2', 'e4')
    state = applyMove(state, 'e7', 'e5')
    state = applyMove(state, 'g1', 'f3')
    const next = undoPlies(state, 2)
    expect(next.history).toEqual(['e4'])
    expect(next.turn).toBe('b')
  })

  it('caps at the history length', () => {
    let state = createInitialState({ minutes: 10 })
    state = applyMove(state, 'e2', 'e4')
    const next = undoPlies(state, 5)
    expect(next.history).toEqual([])
    expect(next.turn).toBe('w')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `applyBotMove`/`undoPlies` are not exported from `./chess`.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/chess.ts` (after `promote`, before `commitMove`):

```ts
export function applyBotMove(state: GameState, uci: string): GameState {
  if (uci.length < 4) return state
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length >= 5 ? (uci[4] as PromotionPiece) : undefined
  const chess = new Chess(state.fen)
  const move = promotion
    ? chess.move({ from, to, promotion })
    : chess.move({ from, to })
  return commitMove(state, chess, move)
}
```

Append after `undo`:

```ts
export function undoPlies(state: GameState, plies: number): GameState {
  let current = state
  for (let i = 0; i < plies; i++) {
    if (current.history.length === 0) break
    current = undo(current)
  }
  return current
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS (existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chess.ts apps/web/lib/chess.test.ts
git commit -m "feat: add bot move and multi-ply undo"
```

---

### Task 4: `useStockfish` hook

**Files:**
- Create: `apps/web/hooks/useStockfish.ts`
- Test: `apps/web/hooks/useStockfish.test.ts`

**Interfaces:**
- Consumes: `createEngine`, `Engine`, `EngineOptions`, `UciWorker` from `../lib/stockfish`.
- Produces: `useStockfish(enabled: boolean): { ready: boolean; getBestMove: (fen: string, opts: EngineOptions) => Promise<string>; newGame: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/hooks/useStockfish.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStockfish } from './useStockfish'

class FakeWorker {
  static instances: FakeWorker[] = []
  postMessage = vi.fn()
  onmessage: ((event: { data: string }) => void) | null = null
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test hooks/useStockfish.test.ts`
Expected: FAIL — module `./useStockfish` not found.

- [ ] **Step 3: Implement**

Create `apps/web/hooks/useStockfish.ts`:

```ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine } from '../lib/stockfish'
import type { Engine, EngineOptions, UciWorker } from '../lib/stockfish'

const ENGINE_WORKER_URL = '/engine/stockfish-18-lite-single.js'

export function useStockfish(enabled: boolean): {
  ready: boolean
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  newGame: () => void
} {
  const engineRef = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.terminate()
      engineRef.current = null
      setReady(false)
      return
    }
    const worker = new Worker(ENGINE_WORKER_URL)
    const engine = createEngine(worker as unknown as UciWorker)
    engineRef.current = engine
    engine.ready.then(() => setReady(true))
    return () => {
      engine.terminate()
      engineRef.current = null
      setReady(false)
    }
  }, [enabled])

  const getBestMove = useCallback((fen: string, opts: EngineOptions) => {
    const engine = engineRef.current
    if (!engine) return Promise.reject(new Error('engine not initialized'))
    const result = chainRef.current.then(
      () => engine.getBestMove(fen, opts),
      () => engine.getBestMove(fen, opts),
    )
    chainRef.current = result.catch(() => {})
    return result
  }, [])

  const newGame = useCallback(() => {
    engineRef.current?.newGame()
  }, [])

  return { ready, getBestMove, newGame }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test hooks/useStockfish.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useStockfish.ts apps/web/hooks/useStockfish.test.ts
git commit -m "feat: add useStockfish hook"
```

---

### Task 5: `useBotOpponent` hook

**Files:**
- Create: `apps/web/hooks/useBotOpponent.ts`
- Test: `apps/web/hooks/useBotOpponent.test.ts`

**Interfaces:**
- Consumes: `EngineOptions` from `../lib/stockfish`; `GameStatus`, `PlayerColor` from `../lib/types`.
- Produces: `useBotOpponent(args: Args): { thinking: boolean }` with the `Args` shape below.

- [ ] **Step 1: Write the failing test**

Create `apps/web/hooks/useBotOpponent.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBotOpponent } from './useBotOpponent'

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    botColor: 'w' as const,
    fen: 'START',
    turn: 'w' as const,
    status: 'playing' as const,
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

  it('reports thinking only while a move is in flight', async () => {
    const args = makeArgs()
    const { result } = renderHook(() => useBotOpponent(args))
    expect(result.current.thinking).toBe(true)
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(result.current.thinking).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test hooks/useBotOpponent.test.ts`
Expected: FAIL — module `./useBotOpponent` not found.

- [ ] **Step 3: Implement**

Create `apps/web/hooks/useBotOpponent.ts`:

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import type { EngineOptions } from '../lib/stockfish'
import type { GameStatus, PlayerColor } from '../lib/types'

const MIN_DELAY_MS = 300
const MAX_DELAY_MS = 800

interface Args {
  enabled: boolean
  botColor: PlayerColor
  fen: string
  turn: PlayerColor
  status: GameStatus
  pendingPromotion: boolean
  engineOptions: EngineOptions
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  onMove: (uci: string) => void
}

export function useBotOpponent(args: Args): { thinking: boolean } {
  const { enabled, botColor, fen, turn, status, pendingPromotion, engineOptions, getBestMove, onMove } = args
  const [thinking, setThinking] = useState(false)
  const generationRef = useRef(0)

  useEffect(() => {
    generationRef.current += 1
  }, [fen])

  useEffect(() => {
    if (!enabled) return
    if (status !== 'playing' && status !== 'check') return
    if (pendingPromotion) return
    if (turn !== botColor) return

    let cancelled = false
    const generation = generationRef.current
    setThinking(true)

    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    const timer = setTimeout(() => {
      getBestMove(fen, engineOptions)
        .then((uci) => {
          if (!cancelled && generation === generationRef.current) {
            onMove(uci)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setThinking(false)
        })
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
      setThinking(false)
    }
  }, [enabled, botColor, fen, turn, status, pendingPromotion, engineOptions, getBestMove, onMove])

  return { thinking }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test hooks/useBotOpponent.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useBotOpponent.ts apps/web/hooks/useBotOpponent.test.ts
git commit -m "feat: add useBotOpponent hook"
```

---

### Task 6: Last-move and check highlights

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `getLastMove`, `getCheckSquare`)
- Test: `apps/web/lib/chess.test.ts` (append; update import)

**Interfaces:**
- Produces: `getLastMove(history: string[]): { from: string; to: string } | null`, `getCheckSquare(fen: string): string | null`.

- [ ] **Step 1: Write the failing tests**

Update the import line of `apps/web/lib/chess.test.ts` to also import `getCheckSquare, getLastMove`:

```ts
import { applyBotMove, applyMove, createInitialState, getCheckSquare, getLastMove, getLegalTargetSquares, getStatus, promote, undo, undoPlies } from './chess'
```

Append to the end of `apps/web/lib/chess.test.ts`:

```ts
describe('getLastMove', () => {
  it('returns the from/to of the last played move', () => {
    expect(getLastMove(['e4', 'e5'])).toEqual({ from: 'e7', to: 'e5' })
  })

  it('returns null for an empty history', () => {
    expect(getLastMove([])).toBeNull()
  })
})

describe('getCheckSquare', () => {
  it('returns the king square when in check', () => {
    const chess = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san)
    expect(getCheckSquare(chess.fen())).toBe('e8')
  })

  it('returns null when not in check', () => {
    const chess = new Chess()
    expect(getCheckSquare(chess.fen())).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `getLastMove`/`getCheckSquare` not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/lib/chess.ts`:

```ts
export function getLastMove(history: string[]): { from: string; to: string } | null {
  if (history.length === 0) return null
  const chess = new Chess()
  let last: { from: string; to: string } | null = null
  for (const san of history) {
    const move = chess.move(san)
    if (move) last = { from: move.from, to: move.to }
  }
  return last
}

export function getCheckSquare(fen: string): string | null {
  const chess = new Chess(fen)
  if (!chess.inCheck()) return null
  const turn = chess.turn()
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece && piece.type === 'k' && piece.color === turn) {
        return piece.square
      }
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chess.ts apps/web/lib/chess.test.ts
git commit -m "feat: add last-move and check highlights"
```

---

### Task 7: Mode and difficulty controls

**Files:**
- Create: `apps/web/components/ModeSelector.tsx`
- Create: `apps/web/components/DifficultyControl.tsx`
- Test: `apps/web/components/ModeSelector.test.tsx`, `apps/web/components/DifficultyControl.test.tsx`

**Interfaces:**
- Consumes: `GameMode`, `GameConfig`, `DifficultyPreset`, `DIFFICULTY_PRESETS`, `resolveEngineOptions` from `../lib/types`.
- Produces: `<ModeSelector mode onChange />`, `<DifficultyControl config onChange />`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ModeSelector.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ModeSelector from './ModeSelector'

describe('ModeSelector', () => {
  it('reports the selected mode on click', async () => {
    const onChange = vi.fn()
    render(<ModeSelector mode="pass-and-play" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(onChange).toHaveBeenCalledWith('vs-computer')
  })

  it('marks the active mode as checked', () => {
    render(<ModeSelector mode="vs-computer" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Play vs. Computer' })).toHaveAttribute('aria-checked', 'true')
  })
})
```

Create `apps/web/components/DifficultyControl.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DifficultyControl from './DifficultyControl'
import type { GameConfig } from '../lib/types'

const base: GameConfig = { mode: 'vs-computer', side: 'white', difficulty: 'intermediate', custom: null }

describe('DifficultyControl', () => {
  it('selecting a preset clears custom', async () => {
    const onChange = vi.fn()
    render(<DifficultyControl config={base} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Difficulty'), 'expert')
    expect(onChange).toHaveBeenCalledWith({ ...base, difficulty: 'expert', custom: null })
  })

  it('reveals sliders when Advanced is toggled', async () => {
    render(<DifficultyControl config={base} onChange={() => {}} />)
    expect(screen.queryByLabelText(/Skill Level/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: /Advanced/ }))
    expect(screen.getByLabelText(/Skill Level/)).toBeInTheDocument()
  })

  it('moving a slider sets custom', () => {
    const onChange = vi.fn()
    render(<DifficultyControl config={{ ...base, custom: { level: 10, depth: 12 } }} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Max Depth/), { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith({ ...base, custom: { level: 10, depth: 15 } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/ModeSelector.test.tsx components/DifficultyControl.test.tsx`
Expected: FAIL — modules `./ModeSelector`/`./DifficultyControl` not found.

- [ ] **Step 3: Implement**

Create `apps/web/components/ModeSelector.tsx`:

```tsx
'use client'

import type { GameMode } from '../lib/types'

export default function ModeSelector({
  mode,
  onChange,
}: {
  mode: GameMode
  onChange: (mode: GameMode) => void
}) {
  return (
    <div role="radiogroup" aria-label="Game mode" className="flex gap-1 rounded-lg bg-gray-100 p-1">
      {(['pass-and-play', 'vs-computer'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={`flex-1 rounded-md px-3 py-1 ${mode === m ? 'bg-white font-medium shadow' : 'text-gray-600'}`}
        >
          {m === 'pass-and-play' ? 'Pass & Play' : 'Play vs. Computer'}
        </button>
      ))}
    </div>
  )
}
```

Create `apps/web/components/DifficultyControl.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { DIFFICULTY_PRESETS, resolveEngineOptions } from '../lib/types'
import type { DifficultyPreset, GameConfig } from '../lib/types'

const PRESETS = Object.keys(DIFFICULTY_PRESETS) as DifficultyPreset[]

export default function DifficultyControl({
  config,
  onChange,
}: {
  config: GameConfig
  onChange: (config: GameConfig) => void
}) {
  const [advanced, setAdvanced] = useState(config.custom !== null)
  const current = resolveEngineOptions(config)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor="difficulty" className="text-sm text-gray-600">Difficulty</label>
        <select
          id="difficulty"
          aria-label="Difficulty"
          value={config.difficulty}
          onChange={(e) => onChange({ ...config, difficulty: e.target.value as DifficultyPreset, custom: null })}
          className="rounded-lg bg-gray-100 px-2 py-1"
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            setAdvanced(e.target.checked)
            if (!e.target.checked) onChange({ ...config, custom: null })
          }}
        />
        Advanced
      </label>

      {advanced && (
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">
            Skill Level: {current.level}
            <input
              type="range"
              min={0}
              max={20}
              value={current.level}
              onChange={(e) => onChange({ ...config, custom: { level: Number(e.target.value), depth: current.depth } })}
              className="w-full"
            />
          </label>
          <label className="text-sm text-gray-600">
            Max Depth: {current.depth}
            <input
              type="range"
              min={1}
              max={20}
              value={current.depth}
              onChange={(e) => onChange({ ...config, custom: { level: current.level, depth: Number(e.target.value) } })}
              className="w-full"
            />
          </label>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/ModeSelector.test.tsx components/DifficultyControl.test.tsx`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ModeSelector.tsx apps/web/components/ModeSelector.test.tsx apps/web/components/DifficultyControl.tsx apps/web/components/DifficultyControl.test.tsx
git commit -m "feat: add mode and difficulty controls"
```

---

### Task 8: Thinking indicator on player card

**Files:**
- Modify: `apps/web/components/PlayerCard.tsx` (add optional `thinking` prop)
- Test: `apps/web/components/PlayerCard.test.tsx` (append)

**Interfaces:**
- Consumes: existing `PlayerCard` props.
- Produces: `PlayerCard` accepts optional `thinking?: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/components/PlayerCard.test.tsx`:

```tsx
it('shows a thinking indicator when thinking is true', () => {
  render(<PlayerCard color="w" name="Computer" captured={[]} remainingMs={600000} active thinking />)
  expect(screen.getByText(/thinking/)).toBeInTheDocument()
})

it('hides the thinking indicator by default', () => {
  render(<PlayerCard color="w" name="Computer" captured={[]} remainingMs={600000} active />)
  expect(screen.queryByText(/thinking/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/PlayerCard.test.tsx`
Expected: FAIL — the two new tests fail (`thinking` text not rendered; the `thinking` prop is not accepted by TypeScript).

- [ ] **Step 3: Implement**

Replace the props destructuring and name line of `apps/web/components/PlayerCard.tsx`:

```tsx
export default function PlayerCard({
  color, name, captured, remainingMs, active, thinking = false,
}: {
  color: PlayerColor
  name: string
  captured: string[]
  remainingMs: number
  active: boolean
  thinking?: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
      <div>
        <div className="flex items-center gap-2 font-semibold">
          {name}
          {thinking && <span className="text-xs font-normal text-gray-500">thinking…</span>}
        </div>
        <div className="text-sm text-gray-600">{captured.map((c) => GLYPHS[c]).join(' ') || '—'}</div>
      </div>
      <div className="font-mono text-lg tabular-nums">{formatClock(remainingMs)}</div>
    </div>
  )
}
```

Keep the `GLYPHS` const and `formatClock` import unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/PlayerCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/PlayerCard.tsx apps/web/components/PlayerCard.test.tsx
git commit -m "feat: add thinking indicator to player card"
```

---

### Task 9: Wire the engine opponent into ChessGame

**Files:**
- Modify: `apps/web/components/ChessGame.tsx` (rewrite)
- Test: `apps/web/components/ChessGame.vsComputer.test.tsx` (create)

**Interfaces:**
- Consumes: `applyBotMove`, `undoPlies`, `getLastMove`, `getCheckSquare` (Tasks 3, 6); `resolveEngineOptions`, `sideToColor`, `GameConfig` (Task 1); `useStockfish` (Task 4); `useBotOpponent` (Task 5); `ModeSelector`, `DifficultyControl` (Task 7); `thinking` prop (Task 8).
- Produces: full vs-computer play loop, mode/side/difficulty controls, highlights, pair-reverting undo, thinking indicator.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ChessGame.vsComputer.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

// Mock the engine hook: choose a legal move for whichever side is to move.
vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    getBestMove: (fen: string) => Promise.resolve(fen.split(' ')[1] === 'w' ? 'e2e4' : 'e7e5'),
    newGame: vi.fn(),
  }),
}))

function clickSquare(container: HTMLElement, square: string) {
  const el = container.querySelector<HTMLElement>(`[data-square="${square}"]`)
  expect(el).not.toBeNull()
  fireEvent.click(el!)
}

describe('ChessGame vs computer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('defaults to pass-and-play', () => {
    render(<ChessGame />)
    expect(screen.getByText('White')).toBeInTheDocument()
    expect(screen.getByText('Black')).toBeInTheDocument()
  })

  it('shows You/Computer labels and side select in vs-computer mode', () => {
    render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Computer')).toBeInTheDocument()
    expect(screen.getByLabelText('You play')).toBeInTheDocument()
  })

  it('lets the bot move first when the human plays black', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    fireEvent.change(screen.getByLabelText('You play'), { target: { value: 'black' } })

    await act(async () => { vi.advanceTimersByTime(800) })
    expect(screen.getByText('1. e4')).toBeInTheDocument()
  })

  it('reverts a full move-pair on undo', async () => {
    const { container } = render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))

    // Human is White: play 1. e4
    clickSquare(container, 'e2')
    clickSquare(container, 'e4')

    // Bot replies 1... e5 after the delay
    await act(async () => { vi.advanceTimersByTime(800) })
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()

    // Undo reverts both plies
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText('1. e4 e5')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/ChessGame.vsComputer.test.tsx`
Expected: FAIL — `ModeSelector`/`DifficultyControl`/`useStockfish`/`useBotOpponent` imports are missing; `You`/`Computer` labels and side select not rendered.

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/web/components/ChessGame.tsx` with:

```tsx
'use client'

import { useCallback, useMemo, useReducer, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import {
  applyBotMove,
  applyMove,
  createInitialState,
  getCheckSquare,
  getLastMove,
  getLegalTargetSquares,
  promote,
  undoPlies,
} from '../lib/chess'
import { TERMINAL_STATUSES, resolveEngineOptions, sideToColor } from '../lib/types'
import type {
  GameConfig,
  GameMode,
  GameState,
  PlayerColor,
  PlayerSide,
  PromotionPiece,
  SideChoice,
  TimeControl,
} from '../lib/types'
import { useChessClock } from '../hooks/useChessClock'
import { useStockfish } from '../hooks/useStockfish'
import { useBotOpponent } from '../hooks/useBotOpponent'
import PlayerCard from './PlayerCard'
import MoveHistory from './MoveHistory'
import PromotionModal from './PromotionModal'
import GameOverModal from './GameOverModal'
import ModeSelector from './ModeSelector'
import DifficultyControl from './DifficultyControl'

const PRESETS = [3, 5, 10] as const
type FlipMode = 'auto' | 'manual' | 'off'

const DEFAULT_CONFIG: GameConfig = {
  mode: 'pass-and-play',
  side: 'white',
  difficulty: 'intermediate',
  custom: null,
}

export type Action =
  | { type: 'move'; from: string; to: string }
  | { type: 'promote'; piece: PromotionPiece }
  | { type: 'undo'; plies?: number }
  | { type: 'bot-move'; uci: string }
  | { type: 'new-game' }
  | { type: 'timeout'; color: PlayerColor }

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move': return applyMove(state, action.from, action.to)
    case 'promote': return promote(state, action.piece)
    case 'undo': return undoPlies(state, action.plies ?? 1)
    case 'bot-move': return applyBotMove(state, action.uci)
    case 'new-game': return createInitialState({ minutes: 10 })
    case 'timeout':
      if (state.status !== 'playing' && state.status !== 'check') return state
      return { ...state, status: 'timeout', winner: action.color === 'w' ? 'b' : 'w', pendingPromotion: null }
    default: return state
  }
}

export default function ChessGame() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)
  const [timeControl, setTimeControl] = useState<TimeControl>({ minutes: 10 })
  const [state, dispatch] = useReducer(reducer, timeControl, createInitialState)
  const [selected, setSelected] = useState<string | null>(null)
  const [flipMode, setFlipMode] = useState<FlipMode>('auto')
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>('white')
  const [resolvedSide, setResolvedSide] = useState<PlayerSide>('white')

  const vsComputer = config.mode === 'vs-computer'
  const humanColor: PlayerColor = sideToColor(resolvedSide)
  const botColor: PlayerColor = resolvedSide === 'white' ? 'b' : 'w'
  const engineOptions = useMemo(
    () => resolveEngineOptions(config),
    [config.difficulty, config.custom],
  )

  const { ready, getBestMove, newGame: engineNewGame } = useStockfish(vsComputer)
  const handleBotMove = useCallback((uci: string) => dispatch({ type: 'bot-move', uci }), [])

  const { thinking } = useBotOpponent({
    enabled: vsComputer,
    botColor,
    fen: state.fen,
    turn: state.turn,
    status: state.status,
    pendingPromotion: state.pendingPromotion !== null,
    engineOptions,
    getBestMove,
    onMove: handleBotMove,
  })

  const { clocks, reset } = useChessClock(
    state.turn,
    state.status,
    timeControl,
    (color) => dispatch({ type: 'timeout', color }),
  )

  const legalTargets = useMemo(
    () => (selected ? getLegalTargetSquares(state.fen, selected) : []),
    [selected, state.fen],
  )

  const lastMove = useMemo(() => getLastMove(state.history), [state.history])
  const checkSquare = useMemo(() => getCheckSquare(state.fen), [state.fen])

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    for (const sq of legalTargets) styles[sq] = { backgroundColor: 'rgba(34,197,94,0.4)' }
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(250,204,21,0.5)' }
      styles[lastMove.to] = { backgroundColor: 'rgba(250,204,21,0.5)' }
    }
    if (checkSquare) styles[checkSquare] = { backgroundColor: 'rgba(239,68,68,0.5)' }
    return styles
  }, [legalTargets, lastMove, checkSquare])

  const boardOrientation = flipMode === 'auto' ? (state.turn === 'w' ? 'white' : 'black')
    : flipMode === 'manual' ? manualOrientation
    : 'white'

  const humanMayAct = !vsComputer || state.turn === humanColor

  const handleSquareClick = (square: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return
    if (!humanMayAct) return
    const chess = new Chess(state.fen)
    if (selected) {
      if (legalTargets.includes(square)) {
        dispatch({ type: 'move', from: selected, to: square })
        setSelected(null)
      } else if (chess.get(square as never)?.color === state.turn) {
        setSelected(square)
      } else {
        setSelected(null)
      }
    } else if (chess.get(square as never)?.color === state.turn) {
      setSelected(square)
    }
  }

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return false
    if (!humanMayAct) return false
    const next = applyMove(state, sourceSquare, targetSquare)
    if (next === state) return false
    dispatch({ type: 'move', from: sourceSquare, to: targetSquare })
    return true
  }

  const undoEnabled = vsComputer
    ? state.turn === humanColor && state.history.length >= 2 && !thinking
    : state.history.length >= 1

  const startGame = (side: PlayerSide) => {
    setResolvedSide(side)
    dispatch({ type: 'new-game' })
    reset()
    setSelected(null)
    engineNewGame()
  }

  const newGame = () => {
    const side: PlayerSide = config.side === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : config.side
    startGame(side)
  }

  const handleModeChange = (mode: GameMode) => {
    setConfig((c) => ({ ...c, mode }))
    const side: PlayerSide = mode === 'vs-computer'
      ? (config.side === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : config.side)
      : 'white'
    startGame(side)
  }

  const handleSideChange = (side: SideChoice) => {
    setConfig((c) => ({ ...c, side }))
    const resolved: PlayerSide = side === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : side
    startGame(resolved)
  }

  const topName = vsComputer ? (resolvedSide === 'black' ? 'You' : 'Computer') : 'Black'
  const bottomName = vsComputer ? (resolvedSide === 'white' ? 'You' : 'Computer') : 'White'
  const topIsBot = vsComputer && botColor === 'b'
  const bottomIsBot = vsComputer && botColor === 'w'

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <ModeSelector mode={config.mode} onChange={handleModeChange} />

      {vsComputer && (
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            You play
            <select
              aria-label="You play"
              value={config.side}
              onChange={(e) => handleSideChange(e.target.value as SideChoice)}
              className="rounded-lg bg-gray-100 px-2 py-1"
            >
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="random">Random</option>
            </select>
          </label>
          <DifficultyControl config={config} onChange={setConfig} />
          {!ready && <p className="text-sm text-amber-600">Engine loading…</p>}
        </div>
      )}

      <PlayerCard
        color="b"
        name={topName}
        captured={state.captured.b}
        remainingMs={clocks.b}
        active={state.turn === 'b'}
        thinking={topIsBot && thinking}
      />

      <Chessboard
        options={{
          position: state.fen,
          boardOrientation,
          squareStyles,
          onSquareClick: ({ square }) => handleSquareClick(square),
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare ? handlePieceDrop(sourceSquare, targetSquare) : false,
          allowDragging: true,
          showNotation: true,
        }}
      />

      <PlayerCard
        color="w"
        name={bottomName}
        captured={state.captured.w}
        remainingMs={clocks.w}
        active={state.turn === 'w'}
        thinking={bottomIsBot && thinking}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            aria-label="Time control"
            value={timeControl.minutes}
            onChange={(e) => {
              setTimeControl({ minutes: Number(e.target.value) })
              dispatch({ type: 'new-game' })
              setSelected(null)
            }}
          >
            {PRESETS.map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
          <select aria-label="Board flip" value={flipMode} onChange={(e) => setFlipMode(e.target.value as FlipMode)}>
            <option value="auto">Auto flip</option>
            <option value="manual">Manual flip</option>
            <option value="off">Off</option>
          </select>
          {flipMode === 'manual' && (
            <button type="button" aria-label="Flip board" onClick={() => setManualOrientation((o) => (o === 'white' ? 'black' : 'white'))} className="rounded-lg bg-gray-100 px-3 py-1">
              Flip
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'undo', plies: vsComputer ? 2 : 1 })}
            disabled={!undoEnabled}
            className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40"
          >
            Undo
          </button>
          <button type="button" onClick={newGame} className="rounded-lg bg-blue-600 px-3 py-1 text-white">New Game</button>
        </div>
      </div>

      <MoveHistory history={state.history} />

      {state.pendingPromotion && (
        <PromotionModal color={state.turn} onSelect={(piece) => dispatch({ type: 'promote', piece })} />
      )}

      {TERMINAL_STATUSES.includes(state.status) && (
        <GameOverModal status={state.status} winner={state.winner} onNewGame={newGame} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the new and existing component tests**

Run: `pnpm test components/ChessGame.vsComputer.test.tsx components/ChessGame.test.tsx`
Expected: PASS — all vs-computer tests plus the existing Phase 1 component tests (turn switch, Fool's mate, board flip, time-control reset).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ChessGame.tsx apps/web/components/ChessGame.vsComputer.test.tsx
git commit -m "feat: wire engine opponent into ChessGame"
```

---

## Final Verification

Run from the repo root after all tasks are complete:

```bash
pnpm test
pnpm --filter web lint
pnpm build
```

Expected: full vitest suite PASS, eslint clean, production build succeeds.

Manual smoke test (`pnpm dev`, open the app on a mobile viewport):

1. Confirm the app loads in **Pass & Play** mode (Phase 1 behavior intact).
2. Switch to **Play vs. Computer**; confirm "You"/"Computer" labels, the side select, and the difficulty control appear.
3. As White, play `1. e4`; confirm the bot replies within ~1s and a "thinking…" indicator shows on the computer card.
4. Confirm last-move squares are highlighted yellow and legal-move squares highlight green on tap.
5. Select "Black" side; confirm the bot (White) moves first.
6. Play a move, let the bot reply, then Undo; confirm both plies are reverted and it is your turn again.
7. Set the difficulty to "Expert" and "Advanced" → Skill Level 20 / Max Depth 20; confirm the game still plays and the bot is noticeably stronger.
