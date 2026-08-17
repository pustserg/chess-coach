# Phase 1 — Local Hotseat App: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 mobile-first hotseat chess app — full rule enforcement via chess.js, per-player chess clocks, promotion/undo/new-game — on a Next.js + TypeScript + Tailwind foundation.

**Architecture:** pnpm monorepo (`apps/web` Next.js app, `services/api` reserved). A `useReducer` owns board state; pure rules functions in `apps/web/lib/chess.ts` wrap chess.js; `useChessClock` owns clock state; `react-chessboard` renders the board.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, chess.js 1.4.0, react-chessboard 5.12.1, Vitest + @testing-library/react + jsdom, pnpm 10.x.

## Global Constraints

- pnpm is the package manager; never use npm/yarn.
- Conventional Commits; one commit per task.
- chess.js is the only source of move legality — never hand-roll rules.
- Stockfish is NOT used in this phase.
- Mobile-first: game content constrained to `max-w-md`.
- No persistence (no localStorage, no DB) in Phase 1.
- TDD: write the failing test, watch it fail, implement, watch it pass, then commit.
- Run tests from `apps/web` with `pnpm test` (vitest run).

## File Structure

| File | Responsibility |
|------|----------------|
| `pnpm-workspace.yaml` | workspace glob `apps/*` |
| `package.json` | root scripts (`dev`, `test`, `build`) delegating to `web` |
| `services/api/README.md` | placeholder for Phase 3 FastAPI backend |
| `apps/web/app/page.tsx` | hotseat screen, `max-w-md`, renders `<ChessGame>` |
| `apps/web/lib/types.ts` | `GameState`, `GameStatus`, `TimeControl`, etc. |
| `apps/web/lib/chess.ts` | pure rules layer over chess.js |
| `apps/web/lib/format.ts` | `formatClock(ms)` display helper |
| `apps/web/hooks/useChessClock.ts` | per-player countdown + flag callback |
| `apps/web/components/ChessGame.tsx` | orchestrator (reducer + board + cards + history + modals) |
| `apps/web/components/PlayerCard.tsx` | turn/captured/clock |
| `apps/web/components/MoveHistory.tsx` | SAN list |
| `apps/web/components/PromotionModal.tsx` | piece picker |
| `apps/web/components/GameOverModal.tsx` | result + reason |
| `apps/web/vitest.config.ts` | vitest + react plugin + jsdom |
| `apps/web/vitest.setup.ts` | jest-dom matchers |

### Cross-task contracts (exact signatures)

```ts
// lib/types.ts
export type PlayerColor = 'w' | 'b'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'
export type GameStatus =
  | 'playing' | 'check' | 'checkmate' | 'stalemate'
  | 'threefold-repetition' | 'insufficient-material' | 'fifty-move' | 'timeout'
export interface TimeControl { minutes: number }
export interface GameState {
  fen: string
  history: string[]
  captured: { w: string[]; b: string[] }
  turn: PlayerColor
  status: GameStatus
  winner: PlayerColor | null
  pendingPromotion: { from: string; to: string } | null
}
export const TERMINAL_STATUSES: readonly GameStatus[]

// lib/chess.ts
export function createInitialState(timeControl: TimeControl): GameState
export function applyMove(state: GameState, from: string, to: string): GameState
export function promote(state: GameState, piece: PromotionPiece): GameState
export function undo(state: GameState): GameState
export function getStatus(chess: Chess): GameStatus
export function getLegalTargetSquares(fen: string, from: string): string[]

// lib/format.ts
export function formatClock(ms: number): string  // "mm:ss"

// hooks/useChessClock.ts
export function useChessClock(
  turn: PlayerColor,
  status: GameStatus,
  timeControl: TimeControl,
  onTimeout: (color: PlayerColor) => void,
): { clocks: { w: number; b: number }; reset: () => void }
```

---

### Task 1: Monorepo scaffold + test runner

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `services/api/README.md`
- Scaffold: `apps/web/` (create-next-app)
- Create: `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`
- Test: `apps/web/app/smoke.test.tsx`

**Interfaces:**
- Produces: `pnpm test` working; `apps/web` package named `web`.

- [ ] **Step 1: Scaffold the workspace and Next.js app**

```bash
cat > pnpm-workspace.yaml <<'EOF'
packages:
  - apps/*
EOF
cat > package.json <<'EOF'
{
  "name": "chess-trainer",
  "private": true,
  "packageManager": "pnpm@10.15.0",
  "scripts": {
    "dev": "pnpm --filter web dev",
    "build": "pnpm --filter web build",
    "test": "pnpm --filter web test"
  }
}
EOF
mkdir -p services/api
cat > services/api/README.md <<'EOF'
# services/api

Reserved for the FastAPI backend (Phase 3+): AI Coach pipeline, PolyGlot/Lichess integration, server-side game logic. Empty in Phase 1.
EOF
pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes
```

- [ ] **Step 2: Add the test toolchain**

```bash
pnpm --filter web add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

Create `apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add to `apps/web/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the smoke test**

Create `apps/web/app/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('renders without crashing', () => {
    render(<div>ok</div>)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test`
Expected: 1 test PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo and Next.js app"
```

---

### Task 2: Game types and initial state

**Files:**
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/lib/chess.ts` (partial — `createInitialState` only)
- Test: `apps/web/lib/chess.test.ts`

**Interfaces:**
- Consumes: chess.js `DEFAULT_POSITION`.
- Produces: `createInitialState`, `GameState` shape from the cross-task contract.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState } from './chess'

describe('createInitialState', () => {
  it('returns the starting position with both clocks at the control', () => {
    const state = createInitialState({ minutes: 5 })
    expect(state.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(state.history).toEqual([])
    expect(state.captured).toEqual({ w: [], b: [] })
    expect(state.turn).toBe('w')
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.pendingPromotion).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — module `./chess` not found.

- [ ] **Step 3: Implement types and initial state**

Create `apps/web/lib/types.ts` (full contents per the cross-task contract, plus):

```ts
export const TERMINAL_STATUSES: readonly GameStatus[] = [
  'checkmate', 'stalemate', 'threefold-repetition',
  'insufficient-material', 'fifty-move', 'timeout',
]
```

Create `apps/web/lib/chess.ts`:

```ts
import { DEFAULT_POSITION } from 'chess.js'
import type { GameState, TimeControl } from './types'

export function createInitialState(_timeControl: TimeControl): GameState {
  return {
    fen: DEFAULT_POSITION,
    history: [],
    captured: { w: [], b: [] },
    turn: 'w',
    status: 'playing',
    winner: null,
    pendingPromotion: null,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add game types and initial state"
```

---

### Task 3: Status detection

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `getStatus`)
- Test: `apps/web/lib/chess.test.ts` (append)

**Interfaces:**
- Consumes: chess.js `Chess`, `inCheck`, `isCheckmate`, `isStalemate`, `isThreefoldRepetition`, `isInsufficientMaterial`, `isDrawByFiftyMoves`.
- Produces: `getStatus(chess: Chess): GameStatus`.

- [ ] **Step 1: Write the failing tests**

```ts
import { Chess } from 'chess.js'
import { getStatus } from './chess'

describe('getStatus', () => {
  it('detects checkmate (Fool\'s mate)', () => {
    const chess = new Chess()
    for (const san of ['f3', 'e5', 'g4', 'Qh4#']) chess.move(san)
    expect(getStatus(chess)).toBe('checkmate')
  })

  it('detects stalemate', () => {
    const chess = new Chess('k7/1R6/2K5/8/8/8/8/8 b - - 0 1')
    expect(getStatus(chess)).toBe('stalemate')
  })

  it('detects threefold repetition', () => {
    const chess = new Chess()
    for (let i = 0; i < 2; i++) {
      for (const san of ['Ng1f3', 'Ng8f6', 'Nf3g1', 'Nf6g8']) chess.move(san)
    }
    expect(getStatus(chess)).toBe('threefold-repetition')
  })

  it('detects insufficient material', () => {
    const chess = new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1')
    expect(getStatus(chess)).toBe('insufficient-material')
  })

  it('detects the fifty-move rule', () => {
    const chess = new Chess('8/8/8/8/8/8/8/K1k5 w - - 100 1')
    expect(getStatus(chess)).toBe('fifty-move')
  })

  it('detects check', () => {
    const chess = new Chess('4k3/8/8/8/8/8/8/4K2r w - - 0 1')
    expect(getStatus(chess)).toBe('check')
  })

  it('returns playing for the starting position', () => {
    expect(getStatus(new Chess())).toBe('playing')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `getStatus` is not exported.

- [ ] **Step 3: Implement `getStatus`**

```ts
import { Chess, DEFAULT_POSITION } from 'chess.js'
import type { GameState, GameStatus, TimeControl } from './types'

export function getStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) return 'checkmate'
  if (chess.isStalemate()) return 'stalemate'
  if (chess.isThreefoldRepetition()) return 'threefold-repetition'
  if (chess.isInsufficientMaterial()) return 'insufficient-material'
  if (chess.isDrawByFiftyMoves()) return 'fifty-move'
  if (chess.inCheck()) return 'check'
  return 'playing'
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add game status detection"
```

---

### Task 4: Apply a move (basic + illegal)

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `applyMove`, private `commitMove`)
- Test: `apps/web/lib/chess.test.ts` (append)

**Interfaces:**
- Consumes: `createInitialState`, `getStatus`, chess.js `Chess`, `moves({ square, verbose })`, `move({ from, to })`.
- Produces: `applyMove(state, from, to): GameState`.

- [ ] **Step 1: Write the failing tests**

```ts
import { applyMove, createInitialState } from './chess'

describe('applyMove', () => {
  it('advances the position, history, and turn', () => {
    let state = createInitialState({ minutes: 5 })
    state = applyMove(state, 'e2', 'e4')
    expect(state.history).toEqual(['e4'])
    expect(state.turn).toBe('b')
    expect(state.fen).toContain(' w KQkq - 0 1'.slice(1)) // side-to-move flipped
    expect(state.fen.split(' ')[1]).toBe('b')
  })

  it('ignores an illegal move', () => {
    const state = createInitialState({ minutes: 5 })
    const next = applyMove(state, 'e2', 'e5')
    expect(next).toBe(state)
  })
})
```

Note: replace the fragile `toContain` assertion with `expect(state.fen.split(' ')[1]).toBe('b')` only — delete the `toContain` line.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `applyMove` is not exported.

- [ ] **Step 3: Implement `applyMove`**

```ts
interface CommittedMove {
  color: 'w' | 'b'
  san: string
  captured?: string
}

export function applyMove(state: GameState, from: string, to: string): GameState {
  const chess = new Chess(state.fen)
  const candidates = chess
    .moves({ square: from as never, verbose: true })
    .filter((m) => m.to === to)
  if (candidates.length === 0) return state
  if (candidates.some((m) => m.promotion)) {
    return { ...state, pendingPromotion: { from, to } }
  }
  const move = chess.move({ from, to })
  return commitMove(state, chess, move)
}

function commitMove(state: GameState, chess: Chess, move: CommittedMove): GameState {
  const captured = { w: [...state.captured.w], b: [...state.captured.b] }
  if (move.captured) captured[move.color].push(move.captured)
  const winner = chess.isCheckmate() ? (chess.turn() === 'w' ? 'b' : 'w') : null
  return {
    fen: chess.fen(),
    history: [...state.history, move.san],
    captured,
    turn: chess.turn(),
    status: getStatus(chess),
    winner,
    pendingPromotion: null,
  }
}
```

Note: `chess.move()` accepts `{ from: string; to: string }` and throws on illegal moves. `applyMove` avoids the throw by pre-validating with `moves({ square, verbose: true })`; the `as never` cast drops the `Square` template-literal constraint on `from` while remaining type-safe at the react-chessboard boundary (squares are validated there).

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add move application"
```

---

### Task 5: Captured pieces and special moves

**Files:**
- Modify: `apps/web/lib/chess.ts` (captured accounting already present; verify en passant + castling)
- Test: `apps/web/lib/chess.test.ts` (append)

**Interfaces:**
- Consumes: `applyMove`, `createInitialState`.
- Produces: correct `captured` accounting for regular captures and en passant; castling handled by chess.js.

- [ ] **Step 1: Write the failing tests**

```ts
describe('captured pieces and special moves', () => {
  it('records a regular capture', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.captured.w).toEqual(['p'])
    expect(state.captured.b).toEqual([])
  })

  it('records an en passant capture', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['a7','a6'], ['e4','e5'], ['d7','d5'], ['e5','d6']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.captured.w).toEqual(['p'])
    expect(state.fen.split(' ')[3]).toBe('-') // no lingering en-passant square
  })

  it('castles kingside for white', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['e7','e5'], ['g1','f3'], ['g8','f6'], ['f1','e2'], ['f8','e7']] as const) {
      state = applyMove(state, f, t)
    }
    state = applyMove(state, 'e1', 'g1') // O-O
    expect(state.history.at(-1)).toBe('O-O')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — en passant/castle assertions not yet satisfied (capture accounting for en passant is the new behavior).

- [ ] **Step 3: Implement**

No new code needed if Task 4's `commitMove` already keys off `move.captured`. If the en-passant assertion fails because chess.js does not set `captured`, switch to `move.isCapture() || move.isEnPassant()` detection and read the captured piece via the move's `captured` field. Verify with the test.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: track captured pieces and special moves"
```

---

### Task 6: Pawn promotion

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `promote`)
- Test: `apps/web/lib/chess.test.ts` (append)

**Interfaces:**
- Consumes: `applyMove` (already sets `pendingPromotion`), chess.js `move({ from, to, promotion })`.
- Produces: `promote(state, piece): GameState`.

- [ ] **Step 1: Write the failing tests**

```ts
import { promote } from './chess'

describe('promotion', () => {
  it('sets pendingPromotion when a pawn reaches the last rank', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5'], ['c7','c6'], ['d5','c6'], ['a7','a6'], ['c6','c7'], ['a6','a5'], ['c7','b8']] as const) {
      state = applyMove(state, f, t)
    }
    expect(state.pendingPromotion).toEqual({ from: 'c7', to: 'b8' })
  })

  it('commits the chosen promotion piece', () => {
    let state = createInitialState({ minutes: 5 })
    for (const [f, t] of [['e2','e4'], ['d7','d5'], ['e4','d5'], ['c7','c6'], ['d5','c6'], ['a7','a6'], ['c6','c7'], ['a6','a5'], ['c7','b8']] as const) {
      state = applyMove(state, f, t)
    }
    state = promote(state, 'n')
    expect(state.pendingPromotion).toBeNull()
    expect(state.history.at(-1)).toBe('b8=N')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `promote` not exported.

- [ ] **Step 3: Implement `promote`**

```ts
export function promote(state: GameState, piece: PromotionPiece): GameState {
  if (!state.pendingPromotion) return state
  const chess = new Chess(state.fen)
  const move = chess.move({
    from: state.pendingPromotion.from,
    to: state.pendingPromotion.to,
    promotion: piece,
  })
  return commitMove(state, chess, move)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pawn promotion"
```

---

### Task 7: Undo and legal target squares

**Files:**
- Modify: `apps/web/lib/chess.ts` (add `undo`, `getLegalTargetSquares`)
- Test: `apps/web/lib/chess.test.ts` (append)

**Interfaces:**
- Consumes: `applyMove`, chess.js `undo()`, `moves({ square, verbose })`.
- Produces: `undo(state): GameState`, `getLegalTargetSquares(fen, from): string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { getLegalTargetSquares, undo } from './chess'

describe('undo', () => {
  it('reverts the last move', () => {
    let state = createInitialState({ minutes: 5 })
    state = applyMove(state, 'e2', 'e4')
    state = applyMove(state, 'e7', 'e5')
    state = undo(state)
    expect(state.history).toEqual(['e4'])
    expect(state.turn).toBe('b')
  })

  it('is a no-op on the initial position', () => {
    const state = createInitialState({ minutes: 5 })
    expect(undo(state)).toBe(state)
  })
})

describe('getLegalTargetSquares', () => {
  it('returns the legal targets for a square', () => {
    const fen = createInitialState({ minutes: 5 }).fen
    expect(getLegalTargetSquares(fen, 'e2')).toEqual(['e3', 'e4'])
    expect(getLegalTargetSquares(fen, 'a1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test lib/chess.test.ts`
Expected: FAIL — `undo`/`getLegalTargetSquares` not exported.

- [ ] **Step 3: Implement**

```ts
export function undo(state: GameState): GameState {
  if (state.history.length === 0) return state
  const chess = new Chess(state.fen)
  const undone = chess.undo()
  if (!undone) return state
  const captured = { w: [...state.captured.w], b: [...state.captured.b] }
  if (undone.captured) captured[undone.color].pop()
  return {
    fen: chess.fen(),
    history: state.history.slice(0, -1),
    captured,
    turn: chess.turn(),
    status: getStatus(chess),
    winner: null,
    pendingPromotion: null,
  }
}

export function getLegalTargetSquares(fen: string, from: string): string[] {
  const chess = new Chess(fen)
  return chess.moves({ square: from as never, verbose: true }).map((m) => m.to)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test lib/chess.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add undo and legal target squares"
```

---

### Task 8: Clock hook

**Files:**
- Create: `apps/web/hooks/useChessClock.ts`
- Create: `apps/web/lib/format.ts` (+ test)
- Test: `apps/web/hooks/useChessClock.test.ts`, `apps/web/lib/format.test.ts`

**Interfaces:**
- Consumes: `TimeControl`, `GameStatus`, `TERMINAL_STATUSES`.
- Produces: `useChessClock(turn, status, timeControl, onTimeout)`, `formatClock(ms)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatClock } from './format'

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(5 * 60_000)).toBe('5:00')
    expect(formatClock(4 * 60_000 + 7_000)).toBe('4:07')
    expect(formatClock(59_000)).toBe('0:59')
    expect(formatClock(0)).toBe('0:00')
  })
})
```

`apps/web/hooks/useChessClock.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test format.test.ts useChessClock.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`apps/web/lib/format.ts`:

```ts
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
```

`apps/web/hooks/useChessClock.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { TERMINAL_STATUSES } from '../lib/types'
import type { GameStatus, PlayerColor, TimeControl } from '../lib/types'

const TICK_MS = 100

export function useChessClock(
  turn: PlayerColor,
  status: GameStatus,
  timeControl: TimeControl,
  onTimeout: (color: PlayerColor) => void,
) {
  const [clocks, setClocks] = useState<{ w: number; b: number }>(() => {
    const ms = timeControl.minutes * 60_000
    return { w: ms, b: ms }
  })
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout
  const running = !TERMINAL_STATUSES.includes(status)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setClocks((prev) => {
        const next = prev[turn] - TICK_MS
        if (next <= 0) {
          clearInterval(id)
          onTimeoutRef.current(turn)
          return { ...prev, [turn]: 0 }
        }
        return { ...prev, [turn]: next }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running, turn])

  const reset = useCallback(() => {
    const ms = timeControl.minutes * 60_000
    setClocks({ w: ms, b: ms })
  }, [timeControl.minutes])

  return { clocks, reset }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test format.test.ts useChessClock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add chess clock hook"
```

---

### Task 9: Player card and move history

**Files:**
- Create: `apps/web/components/PlayerCard.tsx`
- Create: `apps/web/components/MoveHistory.tsx`
- Test: `apps/web/components/PlayerCard.test.tsx`, `apps/web/components/MoveHistory.test.tsx`

**Interfaces:**
- Consumes: `formatClock`, `GameState`, `PlayerColor`.
- Produces: `<PlayerCard color state remainingMs active />`, `<MoveHistory history />`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PlayerCard from './PlayerCard'

describe('PlayerCard', () => {
  it('shows name, captured pieces, and clock', () => {
    render(<PlayerCard color="w" name="White" captured={['p', 'n']} remainingMs={5 * 60_000} active />)
    expect(screen.getByText('White')).toBeInTheDocument()
    expect(screen.getByText('♟ ♞')).toBeInTheDocument()
    expect(screen.getByText('5:00')).toBeInTheDocument()
  })
})
```

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MoveHistory from './MoveHistory'

describe('MoveHistory', () => {
  it('renders numbered SAN moves', () => {
    render(<MoveHistory history={['e4', 'e5', 'Nf3']} />)
    expect(screen.getByText('1. e4 e5')).toBeInTheDocument()
    expect(screen.getByText('2. Nf3')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test PlayerCard.test.tsx MoveHistory.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`PlayerCard.tsx`:

```tsx
import { formatClock } from '../lib/format'
import type { PlayerColor } from '../lib/types'

const GLYPHS: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }

export default function PlayerCard({
  color, name, captured, remainingMs, active,
}: {
  color: PlayerColor
  name: string
  captured: string[]
  remainingMs: number
  active: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
      <div>
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-gray-600">{captured.map((c) => GLYPHS[c]).join(' ') || '—'}</div>
      </div>
      <div className="font-mono text-lg tabular-nums">{formatClock(remainingMs)}</div>
    </div>
  )
}
```

`MoveHistory.tsx`:

```tsx
export default function MoveHistory({ history }: { history: string[] }) {
  const rows: string[] = []
  for (let i = 0; i < history.length; i += 2) {
    const num = `${i / 2 + 1}.`
    const white = history[i]
    const black = history[i + 1]
    rows.push(black ? `${num} ${white} ${black}` : `${num} ${white}`)
  }
  return (
    <ol className="max-h-48 overflow-auto font-mono text-sm">
      {rows.map((r) => <li key={r}>{r}</li>)}
    </ol>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test PlayerCard.test.tsx MoveHistory.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add player card and move history"
```

---

### Task 10: Promotion and game-over modals

**Files:**
- Create: `apps/web/components/PromotionModal.tsx`
- Create: `apps/web/components/GameOverModal.tsx`
- Test: `apps/web/components/PromotionModal.test.tsx`, `apps/web/components/GameOverModal.test.tsx`

**Interfaces:**
- Consumes: `PromotionPiece`, `GameStatus`.
- Produces: `<PromotionModal color onSelect />`, `<GameOverModal status winner onNewGame />`.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PromotionModal from './PromotionModal'

describe('PromotionModal', () => {
  it('offers all four pieces and reports the choice', async () => {
    const onSelect = vi.fn()
    render(<PromotionModal color="w" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /knight/i }))
    expect(onSelect).toHaveBeenCalledWith('n')
  })
})
```

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import GameOverModal from './GameOverModal'

describe('GameOverModal', () => {
  it('shows the result and reason', () => {
    render(<GameOverModal status="checkmate" winner="b" onNewGame={() => {}} />)
    expect(screen.getByText('Black wins')).toBeInTheDocument()
    expect(screen.getByText('Checkmate')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test PromotionModal.test.tsx GameOverModal.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`PromotionModal.tsx` (piece buttons with accessible names "Queen", "Rook", "Bishop", "Knight"):

```tsx
import type { PlayerColor, PromotionPiece } from '../lib/types'

const PIECES: { piece: PromotionPiece; label: string; glyph: string }[] = [
  { piece: 'q', label: 'Queen', glyph: '♛' },
  { piece: 'r', label: 'Rook', glyph: '♜' },
  { piece: 'b', label: 'Bishop', glyph: '♝' },
  { piece: 'n', label: 'Knight', glyph: '♞' },
]

export default function PromotionModal({
  color, onSelect,
}: {
  color: PlayerColor
  onSelect: (piece: PromotionPiece) => void
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-white p-4 text-center" role="dialog" aria-label="Promote pawn">
        <p className="mb-3">Promote to</p>
        <div className="flex gap-2">
          {PIECES.map(({ piece, label, glyph }) => (
            <button
              key={piece}
              type="button"
              aria-label={label}
              onClick={() => onSelect(piece)}
              className="h-14 w-14 rounded-lg bg-gray-100 text-3xl"
            >
              {color === 'w' ? glyph : glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

`GameOverModal.tsx`:

```tsx
import type { GameStatus, PlayerColor } from '../lib/types'

const REASONS: Record<string, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  'threefold-repetition': 'Threefold repetition',
  'insufficient-material': 'Insufficient material',
  'fifty-move': 'Fifty-move rule',
  timeout: 'Time out',
}

export default function GameOverModal({
  status, winner, onNewGame,
}: {
  status: GameStatus
  winner: PlayerColor | null
  onNewGame: () => void
}) {
  const title = winner ? `${winner === 'w' ? 'White' : 'Black'} wins` : 'Draw'
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="rounded-xl bg-white p-6 text-center" role="dialog" aria-label="Game over">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-gray-600">{REASONS[status] ?? status}</p>
        <button type="button" onClick={onNewGame} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white">
          New Game
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test PromotionModal.test.tsx GameOverModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add promotion and game-over modals"
```

---

### Task 11: Orchestrator and screen

**Files:**
- Create: `apps/web/components/ChessGame.tsx`
- Modify: `apps/web/app/page.tsx`
- Test: `apps/web/components/ChessGame.test.tsx`

**Interfaces:**
- Consumes: everything above; `react-chessboard` `Chessboard` with an `options` prop (`position`, `boardOrientation`, `squareStyles`, `onPieceDrop`, `onSquareClick`, `allowDragging`, `showNotation`).
- Produces: `<ChessGame />` — the full hotseat game.

- [ ] **Step 1: Write the failing integration tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ChessGame from './ChessGame'

describe('ChessGame', () => {
  it('switches turn after a move via square clicks', async () => {
    render(<ChessGame />)
    // tap e2 then e4 to play 1. e4
    await userEvent.click(screen.getByLabelText('e2'))
    await userEvent.click(screen.getByLabelText('e4'))
    expect(screen.getByText(/1\. e4/)).toBeInTheDocument()
  })

  it('shows the game-over modal after Fool\'s mate', async () => {
    render(<ChessGame />)
    const moves: [string, string][] = [['f2','f3'], ['e7','e5'], ['g2','g4'], ['d8','h4']]
    for (const [from, to] of moves) {
      await userEvent.click(screen.getByLabelText(from))
      await userEvent.click(screen.getByLabelText(to))
    }
    expect(screen.getByText('Black wins')).toBeInTheDocument()
  })
})
```

Note: `react-chessboard` renders squares with `aria-label` equal to the square id (e.g. `e2`). Confirm at execution; if the board uses different labels, adjust the test to click via a square role/name that exists.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test ChessGame.test.tsx`
Expected: FAIL — `ChessGame` not found.

- [ ] **Step 3: Implement `ChessGame`**

```tsx
'use client'

import { useMemo, useReducer, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { applyMove, createInitialState, getLegalTargetSquares, promote, undo } from '../lib/chess'
import { TERMINAL_STATUSES } from '../lib/types'
import type { GameState, PlayerColor, PromotionPiece, TimeControl } from '../lib/types'
import { useChessClock } from '../hooks/useChessClock'
import PlayerCard from './PlayerCard'
import MoveHistory from './MoveHistory'
import PromotionModal from './PromotionModal'
import GameOverModal from './GameOverModal'

const TIMECONTROL: TimeControl = { minutes: 10 }
type FlipMode = 'auto' | 'manual' | 'off'

type Action =
  | { type: 'move'; from: string; to: string }
  | { type: 'promote'; piece: PromotionPiece }
  | { type: 'undo' }
  | { type: 'new-game' }
  | { type: 'timeout'; color: PlayerColor }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move': return applyMove(state, action.from, action.to)
    case 'promote': return promote(state, action.piece)
    case 'undo': return undo(state)
    case 'new-game': return createInitialState(TIMECONTROL)
    case 'timeout': return { ...state, status: 'timeout', winner: action.color === 'w' ? 'b' : 'w' }
    default: return state
  }
}

export default function ChessGame() {
  const [state, dispatch] = useReducer(reducer, TIMECONTROL, createInitialState)
  const [selected, setSelected] = useState<string | null>(null)
  const [flipMode, setFlipMode] = useState<FlipMode>('auto')

  const { clocks, reset } = useChessClock(
    state.turn,
    state.status,
    TIMECONTROL,
    (color) => dispatch({ type: 'timeout', color }),
  )

  const legalTargets = useMemo(
    () => (selected ? getLegalTargetSquares(state.fen, selected) : []),
    [selected, state.fen],
  )

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {}
    for (const sq of legalTargets) styles[sq] = { backgroundColor: 'rgba(34,197,94,0.4)' }
    return styles
  }, [legalTargets])

  const boardOrientation = flipMode === 'auto' ? (state.turn === 'w' ? 'white' : 'black')
    : flipMode === 'manual' ? undefined
    : 'white'

  const handleSquareClick = (square: string) => {
    if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return
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
    dispatch({ type: 'move', from: sourceSquare, to: targetSquare })
    return true
  }

  const newGame = () => {
    dispatch({ type: 'new-game' })
    reset()
    setSelected(null)
  }

  const colorFor = (c: PlayerColor) => (c === 'w' ? 'White' : 'Black')

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <PlayerCard color="b" name="Black" captured={state.captured.b} remainingMs={clocks.b} active={state.turn === 'b'} />

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

      <PlayerCard color="w" name="White" captured={state.captured.w} remainingMs={clocks.w} active={state.turn === 'w'} />

      <div className="flex items-center justify-between">
        <select aria-label="Board flip" value={flipMode} onChange={(e) => setFlipMode(e.target.value as FlipMode)}>
          <option value="auto">Auto flip</option>
          <option value="manual">Manual flip</option>
          <option value="off">Off</option>
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={() => dispatch({ type: 'undo' })} className="rounded-lg bg-gray-100 px-3 py-1">Undo</button>
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

Note: `boardOrientation` for `manual` mode returns `undefined` (board stays as-is); Task 12 adds a manual flip button. `onPieceDrop` returns `true` unconditionally here; Task 12 makes it return `false` for illegal moves so the dragged piece snaps back.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test ChessGame.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire chess game orchestrator"
```

---

### Task 12: Final polish and full suite

**Files:**
- Modify: `apps/web/app/page.tsx` (render `<ChessGame />` inside `max-w-md`)
- Modify: `apps/web/components/ChessGame.tsx` (manual flip button, illegal-drop rejection)

**Interfaces:**
- Consumes: `<ChessGame />`.
- Produces: the final hotseat screen.

- [ ] **Step 1: Replace `page.tsx`**

```tsx
import ChessGame from '../components/ChessGame'

export default function Page() {
  return (
    <main className="mx-auto max-w-md py-4">
      <ChessGame />
    </main>
  )
}
```

- [ ] **Step 2: Manual flip and illegal-drop rejection**

In `ChessGame.tsx`:

- Add a manual flip button next to the flip `select` that toggles the board orientation between `white` and `black` when `flipMode` is `manual`.
- Pre-validate drags so illegal drops snap back:

```tsx
const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
  if (TERMINAL_STATUSES.includes(state.status) || state.pendingPromotion) return false
  const next = applyMove(state, sourceSquare, targetSquare)
  if (next === state) return false
  dispatch({ type: 'move', from: sourceSquare, to: targetSquare })
  return true
}
```

`applyMove` returns the same state reference for an illegal move, so `next === state` detects it without dispatching.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test`
Expected: all tests PASS, no warnings.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`
Open `http://localhost:3000`, play 1.e4, confirm turn switch, clock tick, undo, promotion, and checkmate detection.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final polish and full test pass"
```

---

## Self-Review Notes

- Spec coverage: mobile-first layout (Task 11/12), rules (Tasks 3–6), special moves (Task 5), promotion modal (Tasks 6/10), status detection (Task 3), flip/undo/new-game (Tasks 7/11/12), move history (Task 9), clocks (Task 8). All Phase 1 checklist items covered.
- The `as never` cast is a deliberate type-boundary concession: `lib/chess.ts` accepts `string` squares (matching react-chessboard), while chess.js's `Square` is a template-literal type. Casting at the boundary is type-safe because react-chessboard only emits valid square ids.
- `onPieceDrop` returning `true` unconditionally in the first pass may leave a rejected drag visually accepted; verify during Task 11 and return `false` when `applyMove` produced no state change (compare `state.fen` before/after dispatch).
