# Phase 2 — Engine Integration & Play vs. Bot: Design Spec

- **Date:** 2026-08-17
- **Status:** Draft
- **Source:** `roadmap.md` Phase 2

## Goal

Add a "Play vs. Computer" mode on top of the existing hotseat app: a client-side Stockfish WASM engine running in a Web Worker, with a game-mode selector, side selection, configurable difficulty (skill level + depth cap), and a full set of visual highlights.

## Context

Phase 1 shipped a mobile-first hotseat app: a `useReducer` owns board state, pure rules functions in `apps/web/lib/chess.ts` wrap chess.js, `useChessClock` owns clock state, and `react-chessboard` renders the board. Phase 2 keeps all of that and layers an engine opponent on top. No backend, auth, or persistence — everything stays client-side.

## Tech Stack

- Everything from Phase 1 (Next.js 15 App Router, TypeScript, Tailwind, chess.js 1.4, react-chessboard 5.12, Vitest + Testing Library + jsdom, pnpm).
- **Stockfish 18** (`nmrugg/stockfish.js`), **lite single-threaded** build — `stockfish-18-lite-single.js` + `stockfish-18-lite-single.wasm` (~7MB). Vendored into `apps/web/public/engine/` and committed to the repo. Single-threaded means no `SharedArrayBuffer`/COOP/COEP headers required. The lite build is weaker than the full engine but still far stronger than any human, per the package README.

## Architecture

### Repo layout additions

```
apps/web/public/engine/       vendored stockfish-18-lite-single.js + .wasm (this phase)
apps/web/lib/stockfish.ts     Web Worker UCI wrapper (engine client)
apps/web/hooks/useStockfish.ts    worker lifecycle + ready/thinking + getBestMove
apps/web/hooks/useBotOpponent.ts  watches turn/side, triggers bot moves
docs/design/                  design specs (this document)
```

### State model

Two cleanly separated state domains:

1. **Board state (`GameState`)** — unchanged from Phase 1 (`fen`, `history`, `captured`, `turn`, `status`, `winner`, `pendingPromotion`). Mode/side/difficulty never live here.
2. **Game configuration (`GameConfig`)** — new React state in `ChessGame`: mode, side choice, difficulty preset, and optional advanced overrides.

The pure `lib/chess.ts` rules layer grows two functions; the engine is wrapped by `lib/stockfish.ts` + two hooks. `ChessGame` remains the orchestrator.

```
Player tap/drop (human)
  → applyMove() / promote() in lib/chess.ts
  → reducer updates state

useBotOpponent effect (bot's turn, game live)
  → artificial delay 300–800ms
  → useStockfish.getBestMove(fen, {level, depth})
  → dispatch bot-move → applyBotMove() commits (incl. promotion)
```

### Game configuration types (`lib/types.ts` additions)

```ts
export type GameMode = 'pass-and-play' | 'vs-computer'
export type SideChoice = 'white' | 'black' | 'random'
export type PlayerSide = 'white' | 'black'              // resolved (no random)
export type DifficultyPreset = 'beginner' | 'casual' | 'intermediate' | 'advanced' | 'expert'
export interface EngineOptions { level: number; depth: number }
export interface GameConfig {
  mode: GameMode
  side: SideChoice
  difficulty: DifficultyPreset
  custom: { level: number; depth: number } | null       // set only by the advanced sliders
}
export const DIFFICULTY_PRESETS: Record<DifficultyPreset, EngineOptions>
export function resolveEngineOptions(config: GameConfig): EngineOptions
export function sideToColor(side: PlayerSide): PlayerColor  // 'white' -> 'w', 'black' -> 'b'
```

Preset map (level, depth): `beginner` (1, 2), `casual` (5, 8), `intermediate` (10, 12), `advanced` (15, 16), `expert` (20, 20). Default difficulty: **intermediate**. `resolveEngineOptions` returns `custom ?? DIFFICULTY_PRESETS[difficulty]`.

Two color vocabularies coexist by design: `PlayerColor` (`'w' | 'b'`) is the board-state domain (from Phase 1), while `PlayerSide` (`'white' | 'black'`) is the UI/orientation domain. `sideToColor` is the single mapping between them; `useBotOpponent.botColor` is always a `PlayerColor`, derived from the resolved side.

### `lib/chess.ts` additions (pure, tested)

```ts
export function applyBotMove(state: GameState, uci: string): GameState
export function undoPlies(state: GameState, plies: number): GameState
```

- `applyBotMove` parses `from` (2 chars), `to` (2 chars), and optional promotion char from the UCI move (`e7e8q`), then commits via chess.js `move({ from, to, promotion })`. The bot never opens the promotion modal.
- `undoPlies` reverts up to `plies` plies by reusing the existing replay-and-`undo()` logic; it is safe when `history.length < plies`.

### `lib/stockfish.ts` — Web Worker UCI wrapper

A thin engine client, decoupled from React for testability:

```ts
export interface UciWorker {
  postMessage(cmd: string): void
  onmessage: ((e: { data: string }) => void) | null
  terminate(): void
}
export interface Engine {
  ready: Promise<void>
  getBestMove(fen: string, opts: EngineOptions): Promise<string>
  newGame(): void
  terminate(): void
}
export function createEngine(worker: UciWorker): Engine
```

- The worker is the vendored `stockfish-18-lite-single.js`; it speaks UCI over `postMessage` strings (no extra framing).
- Init sequence on `createEngine`: `uci` → `isready` (resolve `ready` on `readyok`).
- `getBestMove` sends `setoption name UCI_LimitStrength value true`, `setoption name Skill Level value <level>`, `position fen <fen>`, then `go depth <depth>`, and resolves on `bestmove <move>`.
- One in-flight request at a time (a new call while one is pending is rejected/queued by the caller).
- `newGame` sends `ucinewgame`.

### `hooks/useStockfish.ts`

```ts
export function useStockfish(enabled: boolean): {
  ready: boolean
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  newGame: () => void
}
```

- Lazily spawns the worker on first use (when `enabled`), terminates it on unmount or when `enabled` flips false.
- Guards a single in-flight `getBestMove`; serializes subsequent calls until the current one settles.
- Reusable by Phase 4's AI coach pipeline (which also needs Stockfish evaluation).

### `hooks/useBotOpponent.ts`

```ts
export function useBotOpponent(args: {
  enabled: boolean
  botColor: PlayerColor | null
  fen: string
  turn: PlayerColor
  status: GameStatus
  pendingPromotion: boolean
  engineOptions: EngineOptions
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  onMove: (uci: string) => void
}): { thinking: boolean }
```

- When `enabled`, game is live (`status` is `playing` or `check`), no `pendingPromotion`, and `turn === botColor`: set `thinking` true, wait a random 300–800ms, call `getBestMove`, dispatch `onMove(uci)`, clear `thinking`.
- A generation counter discards a stale bestmove if the position changed (New Game / mode switch) while the request was in flight.
- `thinking` is the UI-facing signal (spans delay + compute).

### Reducer changes (in `ChessGame.tsx`)

- New action `{ type: 'bot-move'; uci: string }` → `applyBotMove`.
- `undo` action gains `plies?: number` (default 1). In `vs-computer`, Undo reverts **2 plies** (the human's move + the bot's reply), returning to the human's turn.

## Components & UI

| File | Responsibility |
|------|----------------|
| `apps/web/components/ChessGame.tsx` | Orchestrator: owns `GameConfig` + board reducer, wires mode/side/difficulty controls, engine hooks, and highlights |
| `apps/web/components/ModeSelector.tsx` | "Pass & Play" / "Play vs. Computer" segmented control (starts a fresh game on switch) |
| `apps/web/components/DifficultyControl.tsx` | Preset select + "Advanced" toggle revealing Skill Level / Max Depth sliders |

Reused unchanged: `PlayerCard`, `MoveHistory`, `PromotionModal`, `GameOverModal`, `page.tsx`.

### UX decisions

- **Mode selector** at the top; default **Pass & Play** on load (preserves Phase 1 behavior). Switching mode starts a new game.
- **Side selection** (vs-computer only): "You play: White / Black / Random", default **White**. Random re-rolls on every New Game; the resolved side is component state (`PlayerSide`).
- **Player cards**: vs-computer labels the resolved side "You" and the other "Computer"; pass-and-play keeps "White"/"Black". The computer card shows a subtle "thinking…" state from `useBotOpponent`.
- **Difficulty**: preset select + "Advanced" toggle revealing two sliders (Skill Level 0–20, Max Depth 1–20). Moving a slider sets `custom`; picking a preset clears `custom`.
- **Undo** (vs-computer): enabled only when `turn === humanColor && history.length >= 2`; reverts 2 plies. Disabled while the bot is thinking. Pass-and-play keeps single-ply undo.
- **New Game**: resets board + clocks, re-rolls Random side, sends `ucinewgame`, and the bot moves first when the bot is White (via `useBotOpponent`).
- **Clocks**: keep the same time-control selector and per-player clocks in both modes; a human flag loses the game (existing `timeout` action).

### Visual highlights (merged into `squareStyles`)

- **Legal moves** on tap — already present (green).
- **Last move** from/to — yellow, derived from chess.js's last verbose move.
- **Check** — the side-to-move king's square tinted red when `inCheck()`.

## Error Handling & Edge Cases

- Engine worker load/init failure → reset `thinking`, show a non-blocking "Engine unavailable" banner; pass-and-play stays fully usable.
- Stale responses discarded via a generation counter (New Game / mode switch mid-compute).
- Bot promotion handled by the UCI promotion char — never opens the modal.
- The bot-move effect is gated on live status + no `pendingPromotion`, so terminal/illegal positions are no-ops.
- `undoPlies` with more plies than history is a safe no-op (capped).

## Testing Strategy

- **Unit `lib/chess.ts`**: `applyBotMove` (plain / capture / promotion), `undoPlies` (1, 2, more than history).
- **Unit `lib/stockfish.ts` + `useStockfish`**: inject a mock `UciWorker` (fake UCI echo) — `ready` resolves on `readyok`; `getBestMove` emits `UCI_LimitStrength true`, `Skill Level N`, `go depth D`, and resolves on `bestmove`; single in-flight enforced.
- **Unit `useBotOpponent`**: bot turn + live status dispatches `onMove` after the delay (fake timers); no-op on human turn / terminal / pending promotion; stale generation discarded.
- **Component**: mode switch resets; side=White → human first; side=Black → bot moves first; undo reverts a full pair; thinking indicator toggles; advanced sliders override the preset.

## Out of Scope (Phase 2)

- Multiplayer / auth / DB (Phase 3), AI coach (Phase 4), opening books (Phase 5), fine-tuning (Phase 6).
- Multi-threaded Stockfish (`SharedArrayBuffer` / COOP / COEP).
- PGN export, sound, board themes, clock increments (backlog).
