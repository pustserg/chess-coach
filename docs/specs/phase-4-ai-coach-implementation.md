# Phase 4 — AI Coach Context Integration: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player in a vs-computer game open a chat drawer, ask the AI coach free-form questions about the current position, and get a streamed reply grounded in a real client-side Stockfish evaluation.

**Architecture:** The client runs a `MultiPV=3` Stockfish analysis (Web Worker) when the coach drawer opens, caches it per FEN, and sends it — along with the FEN, move history, and the full chat so far — to a new stateless `POST /coach/message` endpoint on the existing FastAPI service. The backend builds a system prompt embedding that evaluation as ground truth and proxies a streamed chat completion from Ollama (`qwen2.5:7b-instruct`) back to the browser as chunked plain text, which the client appends token-by-token into the chat transcript. No database involvement, no auth, no persistence — this mirrors how vs-computer games already work today (fully client-driven, no backend game record).

**Tech Stack:** Existing Next.js/TypeScript/Tailwind/Vitest frontend, existing FastAPI/pytest backend. New: `httpx` promoted from a test-only dependency to a runtime one (already installed), and a new `ollama` service in `docker-compose.yml` serving `qwen2.5:7b-instruct`. No new npm or pip packages.

**Spec:** `docs/design/2026-08-28-phase-4-ai-coach-design.md`

## Global Constraints

- Vs-computer mode only. No hotseat or online-multiplayer coaching (deferred).
- Stockfish runs only client-side in a Web Worker. The backend never evaluates a position itself — it only relays the evaluation the client already computed, as ground truth for the LLM.
- Free-form chat, not a single canned prompt.
- Evaluation runs once per FEN (cached client-side), not once per chat message.
- Responses stream token-by-token from Ollama through FastAPI to the browser.
- No persistence anywhere. Chat lives only in React state; closing the drawer clears it.
- No auth on `/coach/message` — it takes context in the request body, not a game ID, and touches no database, matching vs-computer's existing unauthenticated, fully client-driven design.
- Target ELO is a hardcoded `2000` constant (no user-configurable rating; ratings are deferred from Phase 3).
- No rate limiting on `/coach/message` — Ollama is local-only self-hosted infra.
- pnpm is the web package manager; pip + `pyproject.toml` for the API. Never npm/yarn/poetry.
- Conventional Commits; one commit per task.
- TDD: write the failing test, watch it fail, implement, watch it pass, then commit.
- Backend tests run with `pytest` from `services/api` (existing aiosqlite test DB harness; the coach module touches no DB so this is incidental).
- Frontend tests run from `apps/web` with `pnpm test <path>` (vitest run).
- Run the full build + lint + test suites once at the end (final task), not per task.
- Branch: `phase-4-ai-coach` (already created and checked out).

## File Structure

| File | Responsibility |
|------|----------------|
| `docker-compose.yml` | + `ollama` service (image, volume, port 11434); `api` gains `OLLAMA_URL`/`OLLAMA_MODEL` env |
| `services/api/app/config.py` | + `ollama_url`, `ollama_model` settings |
| `services/api/pyproject.toml` | `httpx` moves from dev-only to main deps; `app.coach` added to `packages` |
| `services/api/app/schemas.py` | + `EvaluationIn`, `CoachMessageIn`, `CoachRequest` |
| `services/api/app/coach/__init__.py` | empty package marker |
| `services/api/app/coach/ollama_client.py` | `stream_chat(messages, client=None) -> AsyncIterator[str]` |
| `services/api/app/coach/prompts.py` | `build_system_prompt(req: CoachRequest) -> str` |
| `services/api/app/coach/routes.py` | `POST /coach/message` (`StreamingResponse`) |
| `services/api/app/main.py` | + coach router registration |
| `services/api/tests/test_coach.py` | ollama_client, prompts, and route tests |
| `apps/web/lib/types.ts` | + `Evaluation` type |
| `apps/web/lib/stockfish.ts` | + `getEvaluation(fen, depth)` on `Engine` (MultiPV=3 parsing) |
| `apps/web/hooks/useStockfish.ts` | exposes `getEvaluation` |
| `apps/web/lib/chess.ts` | + `uciLineToSan(fen, uciMoves) -> string[]` |
| `apps/web/lib/coach.ts` | `CoachMessage`, `CoachContext` types; `streamCoachReply(context, messages, onToken)` |
| `apps/web/components/CoachDrawer.tsx` | chat drawer UI |
| `apps/web/components/ChessGame.tsx` | + "Ask Coach" button (vs-computer only) + `CoachDrawer` wiring |
| `docs/specs/phase-4-ai-coach-implementation.md` | this plan |
| `roadmap.md` | Phase 4 checklist ticked at the end |

---

### Task 1: Ollama infra + backend config

**Files:**
- Modify: `docker-compose.yml`
- Modify: `services/api/app/config.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `settings.ollama_url`, `settings.ollama_model` — consumed by Task 2's `ollama_client.py`. The `ollama` compose service — consumed by nothing in-process (it's the external server the client calls over HTTP).

- [ ] **Step 1: Add the `ollama` service to `docker-compose.yml`**

Edit `docker-compose.yml`: add a new `ollama` service, give `api` the URL, and add the model volume.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=chess
      # Local-dev default; override via POSTGRES_PASSWORD for any shared/remote deployment.
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-chess}
      - POSTGRES_DB=chess
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chess -d chess"]
      interval: 5s
      timeout: 5s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama

  api:
    build:
      context: ./services/api
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://chess:${POSTGRES_PASSWORD:-chess}@db:5432/chess
      # No default: must be explicitly provided in the environment.
      - JWT_SECRET=${JWT_SECRET:?JWT_SECRET must be set}
      - CREATE_TABLES_ON_STARTUP=1
      - OLLAMA_URL=http://ollama:11434
      - OLLAMA_MODEL=qwen2.5:7b-instruct
    depends_on:
      db:
        condition: service_healthy
  web:
    build:
      context: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://localhost:8000

volumes:
  pgdata: {}
  ollama-data: {}
```

Pulling the model is a one-time manual step, not part of the compose startup (no init-container plumbing needed for a single `pull`):

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5:7b-instruct
```

- [ ] **Step 2: Add Ollama settings to `config.py`**

Edit `services/api/app/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./chess.db"
    jwt_secret: str = "dev-secret-change-me"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: str = "http://localhost:3000"
    create_tables_on_startup: bool = False
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:7b-instruct"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
```

- [ ] **Step 3: Verify the compose file and settings load**

Run: `docker compose config >/dev/null && echo OK` (validates YAML + interpolation without starting anything)

Run: `cd services/api && python -c "from app.config import settings; print(settings.ollama_url, settings.ollama_model)"`

Expected: `OK` then `http://ollama:11434 qwen2.5:7b-instruct`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml services/api/app/config.py
git commit -m "feat: add ollama service and coach settings"
```

---

### Task 2: `ollama_client.stream_chat`

**Files:**
- Create: `services/api/app/coach/__init__.py` (empty)
- Create: `services/api/app/coach/ollama_client.py`
- Create: `services/api/tests/test_coach.py`
- Modify: `services/api/pyproject.toml`

**Interfaces:**
- Consumes: `settings.ollama_url`, `settings.ollama_model` (Task 1).
- Produces: `stream_chat(messages: list[dict[str, str]], client: httpx.AsyncClient | None = None) -> AsyncIterator[str]` — consumed by Task 4's `routes.py`.

- [ ] **Step 1: Move `httpx` to main dependencies and register the `coach` package**

Edit `services/api/pyproject.toml`:

```toml
[project]
name = "chess-trainer-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.29",
    "aiosqlite>=0.20",
    "python-chess>=1.999",
    "argon2-cffi>=23.1",
    "PyJWT>=2.9",
    "email-validator>=2.2",
    "pydantic-settings>=2.4",
    "alembic>=1.13",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.setuptools]
packages = ["app", "app.auth", "app.games", "app.coach"]
```

- [ ] **Step 2: Create the empty package marker**

Create `services/api/app/coach/__init__.py` (empty file).

- [ ] **Step 3: Write the failing test**

Create `services/api/tests/test_coach.py`:

```python
import json

import httpx
import pytest

from app.coach.ollama_client import stream_chat


def _mock_client(lines: list[str]) -> httpx.AsyncClient:
    body = "\n".join(lines) + "\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_stream_chat_yields_content_tokens_until_done():
    lines = [
        json.dumps({"message": {"content": "Hel"}, "done": False}),
        json.dumps({"message": {"content": "lo"}, "done": False}),
        json.dumps({"message": {"content": ""}, "done": True}),
    ]
    client = _mock_client(lines)
    tokens = [t async for t in stream_chat([{"role": "user", "content": "hi"}], client=client)]
    await client.aclose()
    assert tokens == ["Hel", "lo"]


async def test_stream_chat_raises_on_http_error_status():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, content="boom")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError):
        async for _ in stream_chat([{"role": "user", "content": "hi"}], client=client):
            pass
    await client.aclose()
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd services/api && python -m pip install -e ".[dev]" && pytest tests/test_coach.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.coach.ollama_client'`)

- [ ] **Step 5: Implement `ollama_client.py`**

Create `services/api/app/coach/ollama_client.py`:

```python
import json
from collections.abc import AsyncIterator

import httpx

from ..config import settings


async def stream_chat(
    messages: list[dict[str, str]],
    client: httpx.AsyncClient | None = None,
) -> AsyncIterator[str]:
    """Stream assistant token deltas from Ollama's /api/chat for the given messages."""
    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=60.0)
    try:
        async with http_client.stream(
            "POST",
            f"{settings.ollama_url}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "stream": True},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield content
                if chunk.get("done"):
                    break
    finally:
        if owns_client:
            await http_client.aclose()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest tests/test_coach.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add services/api/pyproject.toml services/api/app/coach/__init__.py services/api/app/coach/ollama_client.py services/api/tests/test_coach.py
git commit -m "feat: add ollama_client.stream_chat"
```

---

### Task 3: `prompts.build_system_prompt`

**Files:**
- Modify: `services/api/app/schemas.py`
- Create: `services/api/app/coach/prompts.py`
- Modify: `services/api/tests/test_coach.py`

**Interfaces:**
- Consumes: nothing new (pure function over the new schema).
- Produces: `EvaluationIn`, `CoachMessageIn`, `CoachRequest` (Pydantic models) and `build_system_prompt(req: CoachRequest) -> str` — both consumed by Task 4's `routes.py`.

- [ ] **Step 1: Add the coach request schemas**

Edit `services/api/app/schemas.py` — append at the end of the file:

```python
class EvaluationIn(BaseModel):
    score_cp: int | None = None
    score_mate: int | None = None
    lines: list[list[str]] = []


class CoachMessageIn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class CoachRequest(BaseModel):
    fen: str
    move_history_san: list[str] = []
    side_to_move: str  # "w" | "b"
    evaluation: EvaluationIn
    target_elo: int = 2000
    messages: list[CoachMessageIn]
```

- [ ] **Step 2: Write the failing test**

Append to `services/api/tests/test_coach.py`:

```python
from app.coach.prompts import build_system_prompt
from app.schemas import CoachRequest, EvaluationIn


def _request(**overrides) -> CoachRequest:
    defaults = dict(
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        move_history_san=["e4", "e5"],
        side_to_move="w",
        evaluation=EvaluationIn(score_cp=35, score_mate=None, lines=[["Nf3", "Nc6"]]),
        target_elo=2000,
        messages=[],
    )
    defaults.update(overrides)
    return CoachRequest(**defaults)


def test_prompt_includes_fen_moves_and_target_elo():
    prompt = build_system_prompt(_request())
    assert "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" in prompt
    assert "e4 e5" in prompt
    assert "2000" in prompt


def test_prompt_formats_centipawn_score_in_pawns():
    prompt = build_system_prompt(_request(evaluation=EvaluationIn(score_cp=35, lines=[])))
    assert "+0.35 pawns" in prompt


def test_prompt_formats_mate_score():
    prompt = build_system_prompt(_request(evaluation=EvaluationIn(score_mate=3, lines=[])))
    assert "Mate in 3 for White" in prompt
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest tests/test_coach.py -v -k prompt`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.coach.prompts'`)

- [ ] **Step 4: Implement `prompts.py`**

Create `services/api/app/coach/prompts.py`:

```python
from ..schemas import CoachRequest


def build_system_prompt(req: CoachRequest) -> str:
    turn_word = "White" if req.side_to_move == "w" else "Black"
    moves = " ".join(req.move_history_san) or "(starting position)"

    if req.evaluation.score_mate is not None:
        mate_side = "White" if req.evaluation.score_mate > 0 else "Black"
        eval_line = f"Mate in {abs(req.evaluation.score_mate)} for {mate_side}"
    elif req.evaluation.score_cp is not None:
        pawns = req.evaluation.score_cp / 100
        eval_line = f"{pawns:+.2f} pawns (White's perspective)"
    else:
        eval_line = "unavailable"

    pv_lines = "\n".join(
        f"  {i + 1}. {' '.join(line)}" for i, line in enumerate(req.evaluation.lines)
    ) or "  (none)"

    return (
        f"You are a chess coach for a club player rated about {req.target_elo} Elo. "
        f"{turn_word} to move. FEN: {req.fen}. Move history (SAN): {moves}.\n"
        "Stockfish evaluation (ground truth — do not re-evaluate the position yourself): "
        f"{eval_line}.\n"
        f"Top engine lines:\n{pv_lines}\n"
        "Explain in terms of pawn structure, weak squares, outposts, and piece activity — "
        "not generic advice. Be concise and concrete."
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_coach.py -v -k prompt`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api/app/schemas.py services/api/app/coach/prompts.py services/api/tests/test_coach.py
git commit -m "feat: add coach system prompt builder"
```

---

### Task 4: `POST /coach/message`

**Files:**
- Create: `services/api/app/coach/routes.py`
- Modify: `services/api/app/main.py`
- Modify: `services/api/tests/test_coach.py`

**Interfaces:**
- Consumes: `schemas.CoachRequest` (Task 3), `prompts.build_system_prompt` (Task 3), `ollama_client.stream_chat` (Task 2).
- Produces: the `/coach/message` HTTP endpoint — consumed by the frontend's `lib/coach.ts` (Task 8).

- [ ] **Step 1: Write the failing tests**

Append to `services/api/tests/test_coach.py`:

```python
import httpx as httpx_module  # for the ConnectError used below


COACH_PAYLOAD = {
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "move_history_san": [],
    "side_to_move": "w",
    "evaluation": {"score_cp": 20, "score_mate": None, "lines": [["Nf3", "Nf6"]]},
    "target_elo": 2000,
    "messages": [{"role": "user", "content": "What's the plan here?"}],
}


def test_coach_message_streams_tokens(client, monkeypatch):
    async def fake_stream_chat(messages):
        assert messages[0]["role"] == "system"
        assert messages[-1] == {"role": "user", "content": "What's the plan here?"}
        yield "Hel"
        yield "lo"

    monkeypatch.setattr("app.coach.routes.ollama_client.stream_chat", fake_stream_chat)
    resp = client.post("/coach/message", json=COACH_PAYLOAD)
    assert resp.status_code == 200
    assert resp.text == "Hello"


def test_coach_message_returns_502_when_ollama_unreachable(client, monkeypatch):
    async def fake_stream_chat(messages):
        raise httpx_module.ConnectError("refused")
        yield  # pragma: no cover - unreachable, keeps this an async generator

    monkeypatch.setattr("app.coach.routes.ollama_client.stream_chat", fake_stream_chat)
    resp = client.post("/coach/message", json=COACH_PAYLOAD)
    assert resp.status_code == 502
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_coach.py -v -k coach_message`
Expected: FAIL (404 — no such route)

- [ ] **Step 3: Implement `routes.py`**

Create `services/api/app/coach/routes.py`:

```python
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import schemas
from . import ollama_client
from .prompts import build_system_prompt

router = APIRouter(prefix="/coach", tags=["coach"])


@router.post("/message")
async def coach_message(req: schemas.CoachRequest) -> StreamingResponse:
    system_prompt = build_system_prompt(req)
    messages = [{"role": "system", "content": system_prompt}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    token_gen = ollama_client.stream_chat(messages)
    try:
        first_token = await anext(token_gen, None)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="coach unavailable") from exc

    async def token_stream():
        if first_token is not None:
            yield first_token
        async for token in token_gen:
            yield token

    return StreamingResponse(token_stream(), media_type="text/plain")
```

- [ ] **Step 4: Register the router**

Edit `services/api/app/main.py`:

```python
from .auth.routes import router as auth_router, me_router
from .games.routes import router as games_router
from .games.ws import router as ws_router
from .profile import router as profile_router
from .coach.routes import router as coach_router

app.include_router(auth_router)
app.include_router(me_router)
app.include_router(games_router)
app.include_router(ws_router)
app.include_router(profile_router)
app.include_router(coach_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pytest tests/test_coach.py -v`
Expected: PASS (all `test_coach.py` tests, including Tasks 2–3's)

- [ ] **Step 6: Commit**

```bash
git add services/api/app/coach/routes.py services/api/app/main.py services/api/tests/test_coach.py
git commit -m "feat: add POST /coach/message endpoint"
```

---

### Task 5: Client-side `getEvaluation` (MultiPV Stockfish parsing)

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/stockfish.ts`
- Modify: `apps/web/lib/stockfish.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Evaluation` type and `Engine.getEvaluation(fen, depth) -> Promise<Evaluation>` — consumed by Task 6's `useStockfish` hook.

- [ ] **Step 1: Add the `Evaluation` type**

Edit `apps/web/lib/types.ts` — append near the other engine types:

```typescript
export interface Evaluation {
  scoreCp: number | null
  scoreMate: number | null
  lines: string[][]
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/lib/stockfish.test.ts`:

```typescript
import type { Evaluation } from './types'

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
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `apps/web`): `pnpm test lib/stockfish.test.ts`
Expected: FAIL (`engine.getEvaluation is not a function`)

- [ ] **Step 4: Implement `getEvaluation` in `stockfish.ts`**

Replace the full contents of `apps/web/lib/stockfish.ts`:

```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `apps/web`): `pnpm test lib/stockfish.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/stockfish.ts apps/web/lib/stockfish.test.ts
git commit -m "feat: add MultiPV evaluation to the stockfish engine wrapper"
```

---

### Task 6: Expose `getEvaluation` from `useStockfish`

**Files:**
- Modify: `apps/web/hooks/useStockfish.ts`
- Modify: `apps/web/hooks/useStockfish.test.ts`

**Interfaces:**
- Consumes: `Engine.getEvaluation` (Task 5).
- Produces: `useStockfish(enabled).getEvaluation(fen, depth) -> Promise<Evaluation>` — consumed by Task 10's `ChessGame.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/hooks/useStockfish.test.ts` (this file already defines a `FakeWorker` class with an `instances` array and stubs `Worker` via `vi.stubGlobal` in `beforeEach` — reuse that, don't redefine it):

```typescript
  it('exposes getEvaluation that delegates to the engine', async () => {
    const { result } = renderHook(() => useStockfish(true))
    const worker = FakeWorker.instances[0]

    await act(async () => {
      worker.onmessage!({ data: 'readyok' })
    })

    const evalPromise = result.current.getEvaluation('START_FEN', 16)
    expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3')

    await act(async () => {
      worker.onmessage!({ data: 'info depth 16 multipv 1 score cp 10 pv e2e4\nbestmove e2e4' })
    })
    const evaluation = await evalPromise
    expect(evaluation.scoreCp).toBe(10)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm test hooks/useStockfish.test.ts`
Expected: FAIL (`result.current.getEvaluation is not a function`)

- [ ] **Step 3: Implement**

Edit `apps/web/hooks/useStockfish.ts`:

```typescript
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine } from '../lib/stockfish'
import type { Engine, UciWorker } from '../lib/stockfish'
import type { EngineOptions, Evaluation } from '../lib/types'

const ENGINE_WORKER_URL = '/engine/stockfish-18-lite-single.js'
const READY_TIMEOUT_MS = 20000

export function useStockfish(enabled: boolean): {
  ready: boolean
  error: string | null
  getBestMove: (fen: string, opts: EngineOptions) => Promise<string>
  getEvaluation: (fen: string, depth: number) => Promise<Evaluation>
  newGame: () => void
} {
  const engineRef = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(0)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.terminate()
      engineRef.current = null
      return
    }
    pendingRef.current = 0
    chainRef.current = Promise.resolve()
    const worker = new Worker(ENGINE_WORKER_URL)
    const engine = createEngine(worker as unknown as UciWorker)
    engineRef.current = engine

    let settled = false
    const fail = () => {
      if (settled) return
      settled = true
      setError('Engine unavailable')
    }

    worker.onerror = () => fail()
    engine.ready.then(() => {
      settled = true
      setReady(true)
      setError(null)
    })
    const timeout = setTimeout(fail, READY_TIMEOUT_MS)
    return () => {
      settled = true
      clearTimeout(timeout)
      engine.terminate()
      engineRef.current = null
      setReady(false)
      setError(null)
    }
  }, [enabled])

  const getBestMove = useCallback((fen: string, opts: EngineOptions) => {
    const engine = engineRef.current
    if (error) return Promise.reject(new Error('engine unavailable'))
    if (!engine) return Promise.reject(new Error('engine not initialized'))
    const run = () => engine.getBestMove(fen, opts)
    pendingRef.current += 1
    const result = pendingRef.current === 1
      ? run()
      : chainRef.current.then(run, run)
    chainRef.current = result.then(
      () => { pendingRef.current -= 1 },
      () => { pendingRef.current -= 1 },
    )
    return result
  }, [error])

  const getEvaluation = useCallback((fen: string, depth: number) => {
    const engine = engineRef.current
    if (error) return Promise.reject(new Error('engine unavailable'))
    if (!engine) return Promise.reject(new Error('engine not initialized'))
    return engine.getEvaluation(fen, depth)
  }, [error])

  const newGame = useCallback(() => {
    engineRef.current?.newGame()
  }, [])

  return { ready, error, getBestMove, getEvaluation, newGame }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm test hooks/useStockfish.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useStockfish.ts apps/web/hooks/useStockfish.test.ts
git commit -m "feat: expose getEvaluation from useStockfish"
```

---

### Task 7: `uciLineToSan`

**Files:**
- Modify: `apps/web/lib/chess.ts`
- Modify: `apps/web/lib/chess.test.ts`

**Interfaces:**
- Consumes: `chess.js` (existing dependency).
- Produces: `uciLineToSan(fen: string, uciMoves: string[]) -> string[]` — consumed by Task 9's `CoachDrawer.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/lib/chess.test.ts`:

```typescript
import { uciLineToSan } from './chess'

describe('uciLineToSan', () => {
  it('converts a UCI move line to SAN from the given position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(uciLineToSan(fen, ['g1f3', 'g8f6', 'd2d4'])).toEqual(['Nf3', 'Nf6', 'd4'])
  })

  it('stops at the first illegal move in the line', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(uciLineToSan(fen, ['g1f3', 'a8a1'])).toEqual(['Nf3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm test lib/chess.test.ts`
Expected: FAIL (`uciLineToSan is not a function`)

- [ ] **Step 3: Implement**

Edit `apps/web/lib/chess.ts` — add near the other helpers (e.g. after `getCheckSquare`):

```typescript
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen)
  const sans: string[] = []
  for (const uci of uciMoves) {
    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.length >= 5 ? (uci[4] as PromotionPiece) : undefined
    try {
      const move = promotion ? chess.move({ from, to, promotion }) : chess.move({ from, to })
      if (!move) break
      sans.push(move.san)
    } catch {
      break
    }
  }
  return sans
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm test lib/chess.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chess.ts apps/web/lib/chess.test.ts
git commit -m "feat: add uciLineToSan helper"
```

---

### Task 8: `lib/coach.ts` — request/stream client

**Files:**
- Create: `apps/web/lib/coach.ts`
- Create: `apps/web/lib/coach.test.ts`

**Interfaces:**
- Consumes: nothing new (plain `fetch`).
- Produces: `CoachMessage`, `CoachContext` types and `streamCoachReply(context, messages, onToken) -> Promise<void>` — consumed by Task 9's `CoachDrawer.tsx` and Task 10's `ChessGame.tsx`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/coach.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { streamCoachReply } from './coach'
import type { CoachContext, CoachMessage } from './coach'

function streamResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status })
}

const CONTEXT: CoachContext = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moveHistorySan: ['e4', 'e5'],
  sideToMove: 'w',
  targetElo: 2000,
  evaluation: { scoreCp: 20, scoreMate: null, lines: [['Nf3', 'Nf6']] },
}

describe('streamCoachReply', () => {
  it('posts the context and messages, and streams tokens to onToken', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse(['Hel', 'lo']))
    const messages: CoachMessage[] = [{ role: 'user', content: "What's the plan?" }]
    const tokens: string[] = []

    await streamCoachReply(CONTEXT, messages, (token) => tokens.push(token))

    expect(tokens.join('')).toBe('Hello')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8000/coach/message')
    const body = JSON.parse(init!.body as string)
    expect(body).toEqual({
      fen: CONTEXT.fen,
      move_history_san: CONTEXT.moveHistorySan,
      side_to_move: CONTEXT.sideToMove,
      evaluation: { score_cp: 20, score_mate: null, lines: [['Nf3', 'Nf6']] },
      target_elo: 2000,
      messages: [{ role: 'user', content: "What's the plan?" }],
    })
  })

  it('throws when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 502 }))
    await expect(streamCoachReply(CONTEXT, [], vi.fn())).rejects.toThrow('coach unavailable (502)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm test lib/coach.test.ts`
Expected: FAIL (module `./coach` does not exist)

- [ ] **Step 3: Implement**

Create `apps/web/lib/coach.ts`:

```typescript
import type { Evaluation, PlayerColor } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface CoachMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CoachContext {
  fen: string
  moveHistorySan: string[]
  sideToMove: PlayerColor
  evaluation: Evaluation
  targetElo: number
}

export async function streamCoachReply(
  context: CoachContext,
  messages: CoachMessage[],
  onToken: (token: string) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/coach/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: context.fen,
      move_history_san: context.moveHistorySan,
      side_to_move: context.sideToMove,
      evaluation: {
        score_cp: context.evaluation.scoreCp,
        score_mate: context.evaluation.scoreMate,
        lines: context.evaluation.lines,
      },
      target_elo: context.targetElo,
      messages,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`coach unavailable (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onToken(decoder.decode(value, { stream: true }))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm test lib/coach.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/coach.ts apps/web/lib/coach.test.ts
git commit -m "feat: add streamCoachReply client"
```

---

### Task 9: `CoachDrawer` component

**Files:**
- Create: `apps/web/components/CoachDrawer.tsx`
- Create: `apps/web/components/CoachDrawer.test.tsx`

**Interfaces:**
- Consumes: `Evaluation` (Task 5), `uciLineToSan` (Task 7), `CoachMessage`/`CoachContext` (Task 8) — all passed in as props, not imported directly, so the component stays testable with fakes (matching `AuthForms`'s existing prop-injection pattern).
- Produces: `CoachDrawer` component — consumed by Task 10's `ChessGame.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/CoachDrawer.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CoachDrawer from './CoachDrawer'

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('CoachDrawer', () => {
  it('runs the evaluation on open and enables the input once ready', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] })
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(getEvaluation).toHaveBeenCalledWith(FEN, 16)
    await waitFor(() => expect(screen.getByLabelText('Ask the coach')).toBeEnabled())
  })

  it('streams a reply into the transcript and sends SAN-converted lines', async () => {
    const getEvaluation = vi.fn().mockResolvedValue({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] })
    const streamReply = vi.fn().mockImplementation(async (_ctx, _messages, onToken) => {
      onToken('Hel')
      onToken('lo')
    })
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={streamReply}
        onClose={vi.fn()}
      />,
    )
    const input = await screen.findByLabelText('Ask the coach')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.type(input, "What's the plan?")
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Hello')).toBeInTheDocument()
    expect(streamReply).toHaveBeenCalledWith(
      expect.objectContaining({
        fen: FEN,
        targetElo: 2000,
        evaluation: { scoreCp: 20, scoreMate: null, lines: [['Nf3', 'Nf6']] },
      }),
      expect.arrayContaining([{ role: 'user', content: "What's the plan?" }]),
      expect.any(Function),
    )
  })

  it('shows an unavailable message when the evaluation fails', async () => {
    const getEvaluation = vi.fn().mockRejectedValue(new Error('boom'))
    render(
      <CoachDrawer
        fen={FEN}
        moveHistorySan={[]}
        sideToMove="w"
        getEvaluation={getEvaluation}
        streamReply={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText('Coach is unavailable')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm test components/CoachDrawer.test.tsx`
Expected: FAIL (module `./CoachDrawer` does not exist)

- [ ] **Step 3: Implement**

Create `apps/web/components/CoachDrawer.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { uciLineToSan } from '../lib/chess'
import type { CoachContext, CoachMessage } from '../lib/coach'
import type { Evaluation, PlayerColor } from '../lib/types'

const TARGET_ELO = 2000
const EVAL_DEPTH = 16

export interface CoachDrawerProps {
  fen: string
  moveHistorySan: string[]
  sideToMove: PlayerColor
  getEvaluation: (fen: string, depth: number) => Promise<Evaluation>
  streamReply: (
    context: CoachContext,
    messages: CoachMessage[],
    onToken: (token: string) => void,
  ) => Promise<void>
  onClose: () => void
}

export default function CoachDrawer({
  fen,
  moveHistorySan,
  sideToMove,
  getEvaluation,
  streamReply,
  onClose,
}: CoachDrawerProps) {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evalReady, setEvalReady] = useState(false)
  const evalCacheRef = useRef<Map<string, Evaluation>>(new Map())

  useEffect(() => {
    setError(null)
    if (evalCacheRef.current.has(fen)) {
      setEvalReady(true)
      return
    }
    setEvalReady(false)
    let cancelled = false
    getEvaluation(fen, EVAL_DEPTH)
      .then((evaluation) => {
        if (cancelled) return
        evalCacheRef.current.set(fen, evaluation)
        setEvalReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('Coach is unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [fen, getEvaluation])

  const handleSend = async () => {
    const text = input.trim()
    const evaluation = evalCacheRef.current.get(fen)
    if (!text || streaming || !evaluation) return

    const nextMessages: CoachMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...nextMessages, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    setError(null)

    const context: CoachContext = {
      fen,
      moveHistorySan,
      sideToMove,
      targetElo: TARGET_ELO,
      evaluation: {
        scoreCp: evaluation.scoreCp,
        scoreMate: evaluation.scoreMate,
        lines: evaluation.lines.map((line) => uciLineToSan(fen, line)),
      },
    }

    try {
      await streamReply(context, nextMessages, (token) => {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          updated[updated.length - 1] = { ...last, content: last.content + token }
          return updated
        })
      })
    } catch {
      setError('Coach is unavailable')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex max-h-[70vh] flex-col gap-2 rounded-t-2xl border border-gray-200 bg-white p-3 shadow-lg md:static md:max-h-none md:rounded-lg md:shadow-none">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Ask Coach</h2>
        <button type="button" aria-label="Close coach" onClick={onClose} className="text-gray-500">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto text-sm">
        {!evalReady && !error && <p className="text-gray-500">Analyzing position…</p>}
        {messages.map((m, i) => (
          <p key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>{m.content}</p>
        ))}
        {error && <p className="text-red-600">{error}</p>}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Ask the coach"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend()
          }}
          disabled={!evalReady || streaming}
          className="flex-1 rounded-lg border border-gray-200 px-2 py-1"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!evalReady || streaming || !input.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1 text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm test components/CoachDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/CoachDrawer.tsx apps/web/components/CoachDrawer.test.tsx
git commit -m "feat: add CoachDrawer chat UI"
```

---

### Task 10: Wire "Ask Coach" into `ChessGame.tsx` (vs-computer only)

**Files:**
- Modify: `apps/web/components/ChessGame.tsx`
- Create: `apps/web/components/ChessGame.coach.test.tsx`

**Interfaces:**
- Consumes: `useStockfish().getEvaluation` (Task 6), `streamCoachReply` (Task 8), `CoachDrawer` (Task 9).
- Produces: nothing further consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ChessGame.coach.test.tsx`:

```typescript
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChessGame from './ChessGame'

vi.mock('../hooks/useStockfish', () => ({
  useStockfish: () => ({
    ready: true,
    error: null,
    getBestMove: () => Promise.resolve('e2e4'),
    getEvaluation: () => Promise.resolve({ scoreCp: 20, scoreMate: null, lines: [['g1f3', 'g8f6']] }),
    newGame: vi.fn(),
  }),
}))

vi.mock('../lib/coach', () => ({
  streamCoachReply: vi.fn().mockResolvedValue(undefined),
}))

describe('ChessGame coach integration', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('only shows Ask Coach in vs-computer mode', () => {
    render(<ChessGame />)
    expect(screen.queryByRole('button', { name: 'Ask Coach' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    expect(screen.getByRole('button', { name: 'Ask Coach' })).toBeInTheDocument()
  })

  it('opens the drawer and runs the evaluation on click', async () => {
    render(<ChessGame />)
    fireEvent.click(screen.getByRole('radio', { name: 'Play vs. Computer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask Coach' }))

    expect(await screen.findByRole('heading', { name: 'Ask Coach' })).toBeInTheDocument()
    await act(async () => {})
    expect(screen.getByLabelText('Ask the coach')).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/web`): `pnpm test components/ChessGame.coach.test.tsx`
Expected: FAIL (no "Ask Coach" button rendered)

- [ ] **Step 3: Implement**

Edit `apps/web/components/ChessGame.tsx`:

Add imports near the top (after the existing `DifficultyControl` import):

```typescript
import CoachDrawer from './CoachDrawer'
import { streamCoachReply } from '../lib/coach'
```

Change the `useStockfish` destructure to include `getEvaluation`:

```typescript
  const { ready, error, getBestMove, getEvaluation, newGame: engineNewGame } = useStockfish(vsComputer)
```

Add drawer-open state alongside the other `useState` calls:

```typescript
  const [coachOpen, setCoachOpen] = useState(false)
```

Add the "Ask Coach" button into the existing button row (the `<div className="flex gap-2">` that holds Undo/New Game), right before the "New Game" button:

```typescript
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'undo', plies: vsComputer ? 2 : 1 })}
            disabled={!undoEnabled}
            className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40"
          >
            Undo
          </button>
          {vsComputer && (
            <button
              type="button"
              onClick={() => setCoachOpen(true)}
              disabled={state.turn !== humanColor || thinking}
              className="rounded-lg bg-gray-100 px-3 py-1 disabled:opacity-40"
            >
              Ask Coach
            </button>
          )}
          <button type="button" onClick={newGame} className="rounded-lg bg-blue-600 px-3 py-1 text-white">New Game</button>
        </div>
```

Add the drawer render just before the closing `</div>` of the component (after the `GameOverModal` block):

```typescript
      {coachOpen && (
        <CoachDrawer
          fen={state.fen}
          moveHistorySan={state.history}
          sideToMove={state.turn}
          getEvaluation={getEvaluation}
          streamReply={streamCoachReply}
          onClose={() => setCoachOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/web`): `pnpm test components/ChessGame.coach.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend suite to check for regressions**

Run (from `apps/web`): `pnpm test`
Expected: PASS (all suites, including `ChessGame.vsComputer.test.tsx`)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ChessGame.tsx apps/web/components/ChessGame.coach.test.tsx
git commit -m "feat: wire Ask Coach button and drawer into vs-computer mode"
```

---

### Task 11: Full verification + roadmap update

**Files:**
- Modify: `roadmap.md`

**Interfaces:**
- Consumes: everything (final integration check).
- Produces: nothing further.

- [ ] **Step 1: Run the full backend suite**

Run: `cd services/api && pytest -v`
Expected: PASS (all tests, including the new `test_coach.py`)

- [ ] **Step 2: Run the full frontend suite, lint, and build**

Run (from `apps/web`):

```bash
pnpm test
pnpm lint
pnpm build
```

Expected: all PASS.

- [ ] **Step 3: Tick the Phase 4 checklist in `roadmap.md`**

Edit `roadmap.md` — change the Phase 4 section's checkboxes from `- [ ]` to `- [x]` for the items actually built:

```markdown
## Phase 4: AI Coach Context Integration

### Objective
Provide an interactive AI Chess Coach capable of explaining positional dynamics, tactical mistakes, and strategic plans in natural language upon request.

### Requirements & Task Checklist
- [x] **UI Integration:**
  - "Ask Coach" action button on the game interface.
  - Responsive drawer (mobile) or side panel (desktop) for AI chat interactions.
- [x] **Context Pipeline:**
  - Capture current board state: FEN string, move history, current player, user's target ELO (~2000 ELO focus).
  - Run Stockfish top-line evaluation: Evaluation score (centipawns/mate), Principal Variation (PV) top 3 moves.
- [x] **LLM Orchestration & Prompting:**
  - API endpoint forwarding structured context to the fine-tuned coach model via Ollama (base fallback: `qwen2.5:7b-instruct`).
  - System prompt enforcing pedagogical tone suitable for advanced players (focus on pawn structures, weak squares, outposts, and piece activity rather than generic advice).
```

- [ ] **Step 4: Commit**

```bash
git add roadmap.md
git commit -m "docs: mark phase 4 checklist complete"
```

- [ ] **Step 5: Open the PR**

Push the branch and open a pull request against `main` per `AGENTS.md`'s workflow rules (dedicated branch, PR-only merge to `main`).

```bash
git push -u origin phase-4-ai-coach
gh pr create --title "Phase 4: AI Coach Context Integration" --body "Implements docs/design/2026-08-28-phase-4-ai-coach-design.md — see docs/specs/phase-4-ai-coach-implementation.md for the task-by-task plan."
```
