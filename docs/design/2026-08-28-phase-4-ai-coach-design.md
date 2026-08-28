# Phase 4 — AI Coach Context Integration: Design Spec

- **Date:** 2026-08-28
- **Status:** Draft
- **Source:** `roadmap.md` Phase 4

## Goal

Let a player ask an AI coach about the current position in a vs-computer game: a chat drawer where the coach explains positional dynamics, tactical mistakes, and strategic plans, grounded in a real Stockfish evaluation rather than the LLM's own (unreliable) judgment.

## Context

Phases 1–3 shipped local hotseat, vs-computer (client-side Stockfish via a Web Worker), and online multiplayer (FastAPI + Postgres, server-authoritative). `services/api` already exists with auth, games, and profile modules. There is no LLM integration yet, and `docker-compose.yml` runs `db`, `api`, and `web` only.

### Scope decisions (settled during brainstorming)

- **Game modes:** vs-computer only. Hotseat has no natural single "owner" of the position to coach; online multiplayer is deferred.
- **Interaction:** free-form chat, not a single canned prompt — the user can ask follow-ups.
- **Evaluation timing:** the client runs one `MultiPV=3` Stockfish analysis when the drawer opens, cached per FEN. Follow-up chat messages reuse it; a new position (opponent/bot moves) invalidates the cache.
- **Response delivery:** streamed token-by-token from Ollama through FastAPI to the browser.
- **Persistence:** none. Chat lives only in React state for the current drawer session; closing the drawer or navigating away loses it.
- **Auth:** none. Vs-computer games are already unauthenticated and fully client-driven; the coach endpoint matches that — it takes context in the request body, not a game ID, and touches no database.
- **Target ELO:** hardcoded constant (`2000`) embedded in the system prompt. No user-configurable rating yet (ratings are deferred from Phase 3).

## Tech Stack

- Existing frontend unchanged: Next.js, TypeScript, Tailwind, Vitest.
- **Backend (new module in the existing FastAPI service):** `httpx` (already a dependency for tests) to call Ollama's HTTP API.
- **New infra:** Ollama, added to `docker-compose.yml`, serving `qwen2.5:7b-instruct` (per `roadmap.md`; the fine-tuned model is Phase 6).
- No new frontend or backend package dependencies beyond what's already installed.

## Architecture

### Data flow

```
client: MultiPV=3 Stockfish eval (Web Worker, cached per FEN)
  → POST /coach/message { fen, moveHistorySan, sideToMove, evaluation, targetElo, messages }
  → FastAPI builds system prompt (board + eval as ground truth) + forwards `messages`
  → Ollama /api/chat (stream=true)
  → FastAPI proxies the token stream back as chunked text/plain
  → client appends tokens to the in-progress assistant message
```

The endpoint is stateless — the client resends the full `messages` history every call, since the chat isn't persisted server-side. This keeps the coach module free of any session/DB concept.

### Repo layout

```
services/api/
  app/
    coach/
      __init__.py
      prompts.py        system prompt template (eval, PV, targetElo, pedagogical tone)
      ollama_client.py   thin async client: stream_chat(messages) -> AsyncIterator[str]
      routes.py          POST /coach/message -> StreamingResponse
    config.py            + OLLAMA_URL, OLLAMA_MODEL settings
    main.py               + coach router
  tests/
    test_coach.py         mocks the Ollama HTTP call
docker-compose.yml         + ollama service (image, volume, port 11434)
apps/web/
  lib/
    stockfish.ts           + getEvaluation(fen, depth) -> Evaluation (MultiPV=3 parsing)
    coach.ts               builds the request body, calls /coach/message, parses the stream
    types.ts               + Evaluation, CoachMessage types
  components/
    CoachDrawer.tsx         chat UI: bottom sheet (mobile) / side panel (desktop)
  components/ChessGame.tsx (or wherever vs-computer renders) + "Ask Coach" button
```

## Client-Side Evaluation

`Engine.getEvaluation(fen, depth)`:
- `setoption name MultiPV value 3`, `position fen …`, `go depth …`.
- Parses `info … multipv N score (cp|mate) V … pv …` lines, keeping the latest per `multipv` index (deeper `info` lines supersede shallower ones at the same index).
- On `bestmove`, resolves `{ scoreCp?: number, scoreMate?: number, lines: { uci: string[], san: string[] }[] }` — up to 3 lines, sorted by multipv index. SAN is derived by replaying each line's UCI moves through `chess.js` from the given FEN.
- Resets `MultiPV` to 1 after resolving, so `getBestMove` (used by the bot opponent) is unaffected.

The drawer triggers this once on open and caches the result by FEN in component state; the bot-move effect that already tracks FEN changes invalidates the cache the same way.

## Backend

### `POST /coach/message`

Request body:
```json
{
  "fen": "…",
  "moveHistorySan": ["e4", "e5", …],
  "sideToMove": "w",
  "evaluation": { "scoreCp": 35, "scoreMate": null, "lines": [{"san": ["Nf3", …]}, …] },
  "targetElo": 2000,
  "messages": [{"role": "user", "content": "What's my plan here?"}]
}
```

No auth dependency, no DB session. `prompts.py` builds one system message from `fen` + `moveHistorySan` + `evaluation` + `targetElo`, instructing the model to reason about pawn structures, weak squares, outposts, and piece activity for a ~2000-ELO player, and to treat the given Stockfish evaluation/PV as ground truth rather than re-evaluating the position itself. `routes.py` prepends that system message to the client's `messages`, calls `ollama_client.stream_chat(...)`, and returns a `StreamingResponse` (`media_type="text/plain"`) yielding each token as it arrives.

`ollama_client.py` POSTs to `{OLLAMA_URL}/api/chat` with `{"model": OLLAMA_MODEL, "messages": [...], "stream": true}`, and yields `chunk["message"]["content"]` for each NDJSON line from Ollama's response, stopping when `chunk["done"]` is true.

### Config

`OLLAMA_URL` (default `http://ollama:11434`, matching the compose service name) and `OLLAMA_MODEL` (default `qwen2.5:7b-instruct`) join `Settings` in `config.py`.

## Frontend

- `CoachDrawer`: bottom sheet on mobile, side panel on desktop (Tailwind responsive classes, consistent with the existing mobile-first layout). Opens via a new "Ask Coach" button shown only in vs-computer mode.
- On open: runs `getEvaluation` if not already cached for the current FEN, shows a loading state during analysis.
- Chat: a text input + send button. Sending appends the user message locally, `POST`s the full context + message history to `/coach/message`, and streams the response into a new assistant message bubble as chunks arrive (`fetch` + `response.body.getReader()`).
- No persistence: closing the drawer clears its message list.

## Error Handling & Edge Cases

- **Ollama unreachable / model not pulled:** the backend call fails — return a `502` with a short error body; the drawer shows an inline "Coach is unavailable" message instead of the chat.
- **Stream interrupted mid-response:** the client keeps whatever tokens arrived and appends an inline "(response interrupted)" note; no retry loop.
- **User sends a new message while a response is still streaming:** the input is disabled until the current stream completes (one in-flight request at a time).
- **Position changes while the drawer is open** (bot replies): the cached evaluation is invalidated and re-run next time the drawer needs it; existing chat history is left as-is (it's about the position at the time it was asked).

## Testing Strategy

- **Backend (pytest + httpx mock transport):**
  - `stream_chat` parses a mocked NDJSON Ollama stream into the expected token sequence.
  - `/coach/message` builds the expected system prompt from a given context and streams back the mocked tokens concatenated.
  - Ollama-unreachable case returns `502`.
- **Frontend (Vitest):**
  - `stockfish.test.ts`: `getEvaluation` parses multi-line MultiPV output (cp score, mate score, 3 PVs) from a mocked worker.
  - `coach.ts` unit test: request body shape, stream parsing into incremental message text.
  - `CoachDrawer.test.tsx`: open triggers evaluation, send streams tokens into the UI, disabled-while-streaming, unavailable-on-error state.

## Out of Scope (Phase 4)

- Hotseat and online-multiplayer coaching (deferred).
- Persisted chat history (backlog candidate if users want to revisit past coaching).
- User-configurable target ELO (waits on Phase 3's deferred ratings).
- Automatic/proactive coaching (e.g., coach flags a blunder unprompted) — this phase is request-only, per the roadmap.
- Fine-tuned model (Phase 6); this phase uses the base `qwen2.5:7b-instruct` only.
- Rate limiting / abuse protection on `/coach/message` (Ollama is local-only self-hosted infra; revisit if ever exposed publicly).
