# AGENTS.md

Guidance for AI agents working in this repository.

## Project

AI Chess Coach & Platform — a mobile-first web app for playing and studying chess: local hotseat, engine play, online multiplayer, and an AI coach that explains positions and plans.

`roadmap.md` is the product requirement document (PRD) and the source of truth for scope. It defines six phases; work should map to a phase.

## Tech Stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS, mobile-first
- Chess core/UI: `chess.js` (rules, FEN/PGN) + `react-chessboard`
- Engine: `stockfish` (nmrugg) WebAssembly build, run client-side in a Web Worker
- Backend: Python FastAPI — AI Coach pipeline, PolyGlot/Lichess integration, server-side game logic
- Database/Auth/Realtime: Supabase (managed Postgres, Supabase Auth, Supabase Realtime)
- AI: Ollama — base model `qwen2.5:7b-instruct` initially, replaced later by a fine-tuned chess-trainer model (Phase 6)
- Infra: Docker Compose for local development

## Rules

- `chess.js` is the single source of truth for board state and move legality. Never hand-roll move validation, FEN/PGN, or special moves (en passant, castling, promotion, draw rules).
- Stockfish runs only client-side inside a Web Worker. Never block the UI thread with engine computation.
- Mobile-first: target vertical phone screens (`max-w-md` container on desktop); the board scales to 100% container width.
- The LLM must not independently evaluate positions. Always feed it Stockfish's evaluation score and principal variation (top 3 moves) as ground truth before asking for commentary.
- Do not reintroduce Prisma, Auth.js (NextAuth), or a custom WebSocket layer — the resolved stack uses Supabase for auth, Postgres, and realtime, and FastAPI only where a server is required (AI, openings, game logic).
- Chess correctness over cleverness: validate rules and edge cases before polish.

## Conventions

- Frontend code is TypeScript.
- Reuse existing patterns; one convention per concern. Clean cutover when replacing code — migrate every caller, leave no shims or aliases.
- Verify behavior before claiming completion: run the relevant command or exercise the changed path; cite the observed output.
- Update `roadmap.md` when scope or the stack changes, so the PRD stays the source of truth.

## Workflow

### Branching & Pull Requests

- Implement each phase on a dedicated branch off `main` — never commit phase work directly to `main`.
- When a phase is complete, open a pull request on GitHub. Changes land only via PR; never merge or push directly to `main`.
- Never force-push (`git push --force`). The only exception is an explicit request from the user.

### Commits & Testing

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`), imperative lowercase subject.
- Cover all code with tests.

### Planning & Documentation

- Before implementing a phase, write a design spec for it.
- Maintain an implementation specification for every task and feature.
- Maintain an ERD diagram covering the entire app's data model.
- Keep these artifacts under `docs/` (e.g. `docs/design/`, `docs/specs/`, `docs/erd.md`).

### Bugs

- For any bug, write a post-mortem documenting root cause, fix, and prevention.
- Update the implementation specification for the affected feature(s) alongside the fix.

### Completing a Phase

- When opening the PR, update `roadmap.md` and mark the completed tasks as done.
