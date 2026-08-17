# Phase 1 — Local Hotseat App: Design Spec

- **Date:** 2026-08-17
- **Status:** Approved
- **Source:** `roadmap.md` Phase 1

## Goal

A mobile-first, single-device web app for two players (hotseat) with complete rule enforcement, per-player chess clocks, and a move history.

## Context

First phase of the AI Chess Coach platform. No backend, auth, or persistence — everything runs client-side. This phase establishes the `apps/web` foundation later phases build on.

## Tech Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- `chess.js` v1.4 — single source of truth for rules and board state
- `react-chessboard` v5 — board rendering
- Vitest + Testing Library + jsdom — tests
- Monorepo: `apps/web` (this phase), `services/api` (reserved for FastAPI, Phase 3)

## Architecture

### Repo layout

```
apps/web/            Next.js application (this phase)
services/api/        reserved for FastAPI backend (Phase 3) — placeholder README only
docs/design/         design specs (this document)
docs/specs/          implementation specifications
docs/erd.md          entity-relationship diagram (app-wide, forward-looking)
```

### State model

One `useReducer` owns board state. `chess.js` is the rules engine, wrapped by pure functions in `lib/chess.ts` so all rules logic is unit-testable without a browser. Clock state lives in a separate `useChessClock` hook that counts down on the active player's side and reports a flag (timeout) via callback.

```
Player tap/drop
  → validate via chess.js
  → applyMove() in lib/chess.ts
  → reducer updates state
  → board + cards + history re-render

Clock effect (interval)
  → decrement active player's remaining time
  → on zero → status = timeout, game over
```

### Game state shape

```ts
type PlayerColor = 'w' | 'b';
type PromotionPiece = 'q' | 'r' | 'b' | 'n';
type GameStatus =
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'threefold-repetition'
  | 'insufficient-material'
  | 'fifty-move'
  | 'timeout';

interface TimeControl { minutes: number }   // no increment in Phase 1

interface GameState {
  fen: string;                              // current position
  history: string[];                        // SAN move list
  captured: { w: string[]; b: string[] };   // pieces each color has captured (opponent's pieces)
  turn: PlayerColor;
  status: GameStatus;
  winner: PlayerColor | null;               // set on checkmate / timeout
  pendingPromotion: { from: string; to: string } | null;
}
```

### lib/chess.ts — pure rules layer

- `createInitialState(timeControl: TimeControl): GameState`
- `applyMove(state: GameState, from: string, to: string): GameState`
  - Delegates legality to chess.js; detects promotion and returns `pendingPromotion` instead of committing.
- `promote(state: GameState, piece: PromotionPiece): GameState`
- `undo(state: GameState): GameState`
- `getStatus(chess): GameStatus` — the one place draw/termination rules are decided.

All functions are pure (no side effects, deterministic output for a given input).

## Components

| File | Responsibility |
|------|----------------|
| `apps/web/app/page.tsx` | Hotseat screen, `max-w-md` container |
| `apps/web/components/ChessGame.tsx` | Orchestrator: owns the reducer, wires board + cards + history + controls + modals |
| `apps/web/components/PlayerCard.tsx` | Turn indicator, captured pieces, clock (top player / bottom player) |
| `apps/web/components/MoveHistory.tsx` | SAN move list |
| `apps/web/components/PromotionModal.tsx` | Piece picker, queen pre-selected |
| `apps/web/components/GameOverModal.tsx` | Result + termination reason |

## Rules & Status Detection

Move validation, en passant, castling, and promotion legality are delegated to `chess.js` — never hand-rolled. After each move, `getStatus()` classifies the position:

| Condition | Detection |
|-----------|-----------|
| Check | `chess.inCheck()` |
| Checkmate | `chess.isCheckmate()` |
| Stalemate | `chess.isStalemate()` |
| Threefold repetition | `chess.isThreefoldRepetition()` |
| Insufficient material | `chess.isInsufficientMaterial()` |
| Fifty-move rule | `chess.isDrawByFiftyMoves()` |
| Timeout | clock reaches zero |

Order matters: checkmate/stalemate take precedence over draw conditions. Timeout is independent of board state.

## Clock

- Per-player countdown; only the active player's clock runs while `status` is `playing` or `check`.
- Presets: 3, 5, 10 minutes. No increment in Phase 1.
- Flag fall → `status = timeout`, `winner` = opponent.
- Undo reverts one ply and returns the turn to the previous player; clock time is **not** refunded (documented simplification).

## UX Decisions

- **Board flip:** three modes — Auto (rotates to face the player to move, default), Manual (tap to flip), Off (white at bottom). One manual flip control always available.
- **Promotion:** modal piece picker, queen pre-selected; all four piece choices are offered and one must be selected to complete the move.
- **Highlights:** legal-move squares on piece tap, last-move square, and check indicator (via `react-chessboard` `squareStyles`).
- **Controls:** New Game (resets board + clocks + history) and Undo.

## Error Handling & Edge Cases

- Illegal move (drop/tap) is ignored — no state change, no error UI needed (board already constrains input to legal moves).
- Promotion must be completed before the next move; the modal is not dismissible without choosing a piece.
- Clock only ticks when the game is live; it stops on any terminal status.
- Undo on the initial position is a no-op.

## Testing Strategy

- **Unit (`lib/chess.ts`):** each status case (checkmate, stalemate, threefold, insufficient material, fifty-move), en passant, castling, promotion detection, captured-piece accounting, undo.
- **Unit (`useChessClock`):** countdown, turn switch pauses the other clock, flag fall, no tick after terminal status.
- **Component/integration:** move → turn switches; checkmate → `GameOverModal`; promotion flow end-to-end; undo restores prior position.

## Out of Scope (Phase 1)

- Persistence (refresh resets the game; DB arrives in Phase 3)
- Draw offers, resignation, increment, sound
- Engine play (Phase 2), multiplayer/auth (Phase 3), AI coach (Phase 4)
- ERD: `docs/erd.md` will describe the Phase 3 schema, but this phase touches no database.
