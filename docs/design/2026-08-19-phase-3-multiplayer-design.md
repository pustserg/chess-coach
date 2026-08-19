# Phase 3 — Multiplayer, User Profiles & Database: Design Spec

- **Date:** 2026-08-19
- **Status:** Draft
- **Source:** `roadmap.md` Phase 3

## Goal

Add online multiplayer to the chess app: users (email/password or anonymous guests) create games, invite opponents via a shareable link, and play over a realtime connection with server-authoritative rules and clocks. Persist games, moves, and user stats in Postgres, and add a profile dashboard.

## Context

Phases 1–2 shipped a fully client-side app: a `useReducer` owns board state, `lib/chess.ts` wraps chess.js, `useChessClock` owns the client clock, `useStockfish` + `useBotOpponent` drive the engine. There is no backend, auth, or persistence today — `services/api` is an empty stub and `docker-compose.yml` only runs `web`.

Phase 3 is the first server-backed phase. Per the user's direction, it uses **raw Postgres + a custom realtime/auth layer** rather than Supabase, and grows the reserved **FastAPI** service into the real backend. This overrides AGENTS.md's "no custom WebSocket layer" rule and the Supabase resolution in `roadmap.md`; the roadmap will be updated at PR time to reflect the resolved stack.

### Scope decisions (settled during brainstorming)

- **Auth:** email/password now; Google OAuth and magic link deferred.
- **Anonymous guests:** included — a shareable link lets the opponent play instantly with no signup, with an upgrade path to a named account.
- **Game authority:** server-authoritative — FastAPI validates every move with `python-chess`.
- **Clocks:** server-authoritative time controls.
- **Ratings/Elo:** deferred (no `ratings` table yet).
- **Spectators:** deferred (only the two players connect; a full game rejects joiners).
- **Realtime:** single FastAPI service with native WebSockets (no message bus, no multi-process fan-out).

## Tech Stack

- Existing frontend unchanged: Next.js 15 App Router, TypeScript, Tailwind, chess.js 1.4, react-chessboard 5.12, Vitest + Testing Library.
- **Backend (new):** Python 3.12, FastAPI, Uvicorn, SQLAlchemy 2 (async) + asyncpg, `python-chess`, Argon2 (`argon2-cffi`), PyJWT, Alembic, pytest + httpx.
- **DB:** PostgreSQL 16 (docker-compose).
- `python-chess` is the server-side rules engine, the direct analogue of client-side `chess.js`. No hand-rolled move validation on either side.

## Architecture

### Realtime model

Single FastAPI service owns both HTTP (auth, game CRUD, profile) and a WebSocket endpoint per game. A `ConnectionManager` holds the live connections for each game. Every mutation is:

```
client intent (WS) → python-chess validation → transactional Postgres write → broadcast authoritative state
```

The client renders server state and uses its own chess.js only to *propose* moves and highlight legal targets — never as the authority.

### Repo layout

```
services/api/                      grows from the empty stub
  app/
    main.py                        FastAPI app, lifespan, CORS, routers
    config.py                      env: DATABASE_URL, JWT secret
    db.py                          async SQLAlchemy engine + session
    models.py                      ORM: users, games, moves
    schemas.py                     Pydantic request/response models
    auth/
      security.py                  argon2 hashing, JWT issue/verify
      deps.py                      get_current_user dependency
      routes.py                    register/login/refresh/logout/anonymous/claim
    games/
      chess_engine.py              python-chess wrapper (validate/apply/terminal)
      clock.py                     server clock math (remaining time)
      ws.py                        WebSocket endpoint + ConnectionManager
      routes.py                    REST: create/get/join, resign, draw
    profile.py                     user stats endpoint
  migrations/                      Alembic
  tests/
  pyproject.toml
  Dockerfile
docker-compose.yml                 + db (postgres:16), + api (uvicorn)
apps/web/
  lib/api.ts                       API + WS client, types
  hooks/useAuth.ts                 tokens + login/register/guest/logout
  hooks/useOnlineGame.ts           WS client + state sync
  components/OnlineGame.tsx        board orchestrator (online mode)
  components/Auth*.tsx             login/register/guest UI
  app/online/page.tsx              create-game lobby
  app/game/[id]/page.tsx           the online game
docs/erd.md                        updated data model
```

`GameMode` gains `'online'`; pass-and-play and vs-computer are untouched.

## Data Model

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `email` | text | nullable, unique (null for anonymous) |
| `password_hash` | text | nullable (null for anonymous) |
| `display_name` | text | |
| `is_anonymous` | bool | |
| `created_at` | timestamptz | |

### `games`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | the share-link `gameId` |
| `white_player_id` | uuid fk → users | nullable until a seat is taken |
| `black_player_id` | uuid fk → users | nullable until a seat is taken |
| `status` | text | `waiting\|playing\|white-won\|black-won\|draw\|aborted` |
| `result_reason` | text | `checkmate\|stalemate\|threefold\|insufficient\|fifty-move\|timeout\|resignation\|agreed-draw` (null while live) |
| `time_control_minutes` | int | |
| `turn` | text | `w`/`b` |
| `fen` | text | canonical current position |
| `white_clock_ms` / `black_clock_ms` | int | remaining time |
| `last_turn_started_at` | timestamptz | for elapsed-time math |
| `started_at` / `ended_at` | timestamptz | |

### `moves`
| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial pk | |
| `game_id` | uuid fk → games | |
| `ply` | int | 1-based |
| `color` | text | `w`/`b` |
| `san` | text | |
| `uci` | text | |
| `fen_after` | text | |
| `created_at` | timestamptz | the timestamped move log |

Canonical current state is denormalized on `games` for fast sync/reconnection; `moves` is the append-only replay log (used for PGN and Phase 5 analysis). Indexes on `games.white_player_id` and `games.black_player_id` back the stats query.

## Auth

- **Email/password:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`. Argon2id hashing, HS256 JWTs — short-lived access token, longer-lived refresh token.
- **Anonymous guest:** `POST /auth/anonymous` mints an anonymous user (no email, no password) + tokens. The client stores them, so a guest's games persist and survive reconnect.
- **Upgrade:** `POST /auth/claim {email, password}` attaches credentials to an anonymous account, preserving its games and stats.
- **Session storage:** bearer tokens in `localStorage` for v1 (cross-origin cookies are awkward in self-hosted dev). HttpOnly-cookie hardening, email verification, and password reset are deferred — no email provider in the self-hosted stack yet.

## Game Flow & State Machine

- **Create:** `POST /games {side, time_control_minutes}` (guest or user) → `gameId` + `…/game/<id>` share link; the creator takes their seat. `side` is `white|black` (default `white`; random is not offered in v1).
- **Join:** opening the link mints a guest session if unauthenticated; the server assigns the open seat. A full game rejects joiners (no spectators in v1).
- **States:** `waiting` (opponent not yet joined; creator may abort) → `playing` → terminal. A per-seat `connected` flag drives an "opponent disconnected/reconnected" banner.
- **Disconnect policy:** the server clock is authoritative and keeps running; a dropped player's clock flags → timeout loss. Reconnect re-attaches the seat and resyncs state (clock recovered from `last_turn_started_at`).
- **Draw & resign:** `resign` ends the game (`resignation`). `offer-draw`/`accept-draw`/`decline-draw` — a single outstanding offer. Rule draws (threefold, insufficient material, fifty-move, stalemate) are detected server-side automatically.

## WebSocket Protocol — `GET /games/{id}/ws?token=…`

**Client → server:**

- `move {from, to, promotion?}` — move intent; promotion char `q/r/b/n` when applicable.
- `resign`
- `offer-draw` / `accept-draw` / `decline-draw`
- `ping`

**Server → client:**

- `state` — full authoritative snapshot: `status` (`waiting|playing|white-won|black-won|draw|aborted`), `turn`, `fen`, `san_history`, `last_move {from,to}`, `check`, `check_square`, `clocks {w_ms, b_ms}`, `white`/`black` `{id, display_name, connected}`, `you_are`, `result`, `draw_offered_by`.
- `move-accepted {move}` / `move-rejected {reason}`
- `clock {w_ms, b_ms}` — ~1s display ticks (computed in memory).
- `draw-offered {by}` / `draw-declined`
- `game-over {result, reason, pgn}`
- `opponent-status {connected}`

Clock ticks are computed from `last_turn_started_at` and broadcast in memory; only moves and timeout persist the clock to DB.

## Frontend

- `useAuth` — token storage, `login`/`register`/`guest`/`logout`, authenticated fetch helper.
- `useOnlineGame` — WS connect with backoff reconnect, parses server messages into an `OnlineGameState`, exposes `sendMove`/`resign`/`offerDraw`/`acceptDraw`/`declineDraw`.
- `OnlineGame` — reuses `Chessboard`, `PlayerCard`, `MoveHistory`, `PromotionModal`, `GameOverModal`. Promotion is detected client-side (the existing `pendingPromotion` pattern) and the chosen piece is sent in the move intent. Captured pieces and the check highlight are derived from the authoritative FEN.
- Routes: `/online` (create + share link) and `/game/[id]` (the game). The `/` homepage gains an "Play online" entry; local modes stay where they are.
- `GameMode` gains `'online'`; `types.ts` gains an `OnlineGameState` mirroring the server `state` message (kept separate from the client-only `GameState` to avoid forcing the server to reproduce client-only fields).

## Error Handling & Edge Cases

- **Illegal move** (shouldn't happen with client validation) → `move-rejected`, state unchanged.
- **Move sent out of turn / on a finished game** → `move-rejected` (or ignored), authoritative state re-sent.
- **Promotion without a piece** → `move-rejected` with `reason: "promotion-required"`; client re-prompts.
- **Stale/duplicate reconnect** → the newer connection wins; the older socket is closed.
- **WS drop mid-compute** → clock keeps running; reconnect resyncs from DB state.
- **DB write failure** → rollback, no broadcast, `error` sent to the mover; state stays consistent.
- **Auth token expired** → `401`/`4401` over WS and REST; client refreshes via `/auth/refresh`.

## Testing Strategy

- **Backend (pytest + httpx + asyncpg test DB):**
  - Auth: register/login/refresh/logout, anonymous mint, duplicate email, wrong password, claim (upgrade preserves games).
  - chess_engine wrapper: legal/illegal move, promotion, castling, en passant, checkmate, stalemate, threefold, insufficient material, fifty-move.
  - Clock: decrement on move, timeout flag, reconnect recovery.
  - WebSocket: two clients, move sync, illegal-move rejection, draw offer/accept/decline, resign, disconnect→reconnect seat re-attach, full-game join rejection.
  - REST: create game, join assigns seat, abort waiting game.
- **Frontend (Vitest):**
  - `useAuth` with mocked fetch; `useOnlineGame` with a mock WebSocket (connect, parse state, send intent, reconnect, draw/resign).
  - `OnlineGame` render, promotion flow, game-over, disconnect banner.
  - Existing suites stay green (online mode is additive).

## Out of Scope (Phase 3)

- Google OAuth and email magic link (deferred).
- Ratings/Elo (deferred; no `ratings` table).
- Spectator mode (deferred).
- Clock increments (Fischer/Bronstein) — backlog.
- Email verification and password reset (no email provider yet).
- HttpOnly-cookie auth hardening (v1 uses `localStorage` bearer tokens; XSS tradeoff noted).
- Horizontal scaling / Redis / multi-process fan-out (revisit if we scale past one process).
- PGN export/import — backlog.
