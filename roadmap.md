# AI Chess Coach & Platform — Product Requirement Document (PRD)

## Architectural Overview & Tech Stack

* **Frontend:** Next.js (React), Tailwind CSS (Mobile-First Design)
* **Chess Core & UI:** `chess.js` (rule validation, FEN/PGN generation), `react-chessboard` (interactive board renderer)
* **Chess Engine:** `stockfish` (nmrugg) WebAssembly build, client-side execution via Web Workers
* **Backend:** Python (FastAPI) — AI Coach pipeline, PolyGlot/Lichess integration, server-side game logic
* **Realtime:** Supabase Realtime
* **Database & Auth:** PostgreSQL (managed via Supabase), Supabase Auth (Google OAuth, Magic Link, anonymous)
* **AI Coach Engine:** Ollama (initial: `qwen2.5:7b-instruct`; later: fine-tuned chess-trainer model), PolyGlot opening books (`.bin`), Lichess Opening Explorer API
* **Infra:** Docker compose for local

---

## Phase 1: Local Hotseat App (Mobile-First Core)

### Objective
Build a fully functional, mobile-first web application enabling two players to play chess on a single device (Hotseat mode) with complete rule enforcement.

### Requirements & Task Checklist
- [ ] **Mobile-First Layout:**
  - Designed primarily for vertical mobile screens (`max-w-md` container on desktop).
  - Chessboard scales to 100% container width.
  - Top and bottom player indicator cards with turn status, captured pieces, and move timers.
- [ ] **Chess Rules Integration:**
  - Integrate `chess.js` for state management and move validation.
  - Implement special moves: en passant, castling, and pawn promotion modals.
  - Game status detection: Check, Checkmate, Stalemate, Threefold Repetition, Insufficient Material, 50-move rule.
- [ ] **Controls & UX:**
  - Flip board option (automatic or manual rotation per turn).
  - Move history display (PGN notation format).
  - Game control actions: "New Game", "Undo Move" (Takeback).

---

## Phase 2: Engine Integration & Play vs. Bot

### Objective
Integrate a client-side Stockfish engine running via WebAssembly to allow single-player practice against AI bots of customizable difficulty.

### Requirements & Task Checklist
- [ ] **Client-Side Stockfish WASM:**
  - Load the `stockfish` WASM build inside a Web Worker to ensure UI thread remains non-blocking during heavy calculations.
- [ ] **Game Mode Selector:**
  - Mode toggle: "Pass & Play (Local)" vs. "Play vs. Computer".
  - Side selection: White, Black, or Random.
- [ ] **Bot Configuration:**
  - Adjust skill level (Stockfish Skill Level 0 to 20 or depth limiting).
  - Add artificial response delay (300–800ms) for realistic interaction feel.
- [ ] **Visual Analysis Highlights:**
  - Highlight legal moves on piece touch/click.
  - Display check indicator and last move highlights.

---

## Phase 3: Multiplayer, User Profiles & Database

### Objective
Enable online play by allowing users to create games, invite friends via shareable links, authenticate, and persist game history.

### Requirements & Task Checklist
- [ ] **Authentication & User Profiles:**
  - Support Google OAuth, Email Magic Link, and Anonymous Guest sessions.
  - User profile dashboard with stats (Games played, Win/Loss/Draw ratios).
- [ ] **Realtime Multiplayer Engine:**
  - Supabase Realtime synchronization layer (Postgres CDC over WebSockets).
  - Room creation flow: Generate unique `gameId` -> Shareable invite URL.
  - Matchmaking state machine: Handle player connection, reconnection timeouts, and spectator mode.
- [ ] **Database & Game Persistence:**
  - PostgreSQL schema for `Users`, `Games`, `Moves`, and `Ratings`.
  - Store completed PGNs, game duration, termination reasons, and timestamped move logs.

---

## Phase 4: AI Coach Context Integration

### Objective
Provide an interactive AI Chess Coach capable of explaining positional dynamics, tactical mistakes, and strategic plans in natural language upon request.

### Requirements & Task Checklist
- [ ] **UI Integration:**
  - "Ask Coach" action button on the game interface.
  - Responsive drawer (mobile) or side panel (desktop) for AI chat interactions.
- [ ] **Context Pipeline:**
  - Capture current board state: FEN string, move history, current player, user's target ELO (~2000 ELO focus).
  - Run Stockfish top-line evaluation: Evaluation score (centipawns/mate), Principal Variation (PV) top 3 moves.
- [ ] **LLM Orchestration & Prompting:**
  - API endpoint forwarding structured context to the fine-tuned coach model via Ollama (base fallback: `qwen2.5:7b-instruct`).
  - System prompt enforcing pedagogical tone suitable for advanced players (focus on pawn structures, weak squares, outposts, and piece activity rather than generic advice).

---

## Phase 5: Opening Database & Structured Curriculum (0 to 2000+ ELO)

### Objective
Build a comprehensive training hub featuring interactive lessons, opening theory validation, and adaptive learning paths tailored to user weaknesses.

### Requirements & Task Checklist
- [ ] **Opening Theory Engine:**
  - Integrate Lichess Opening Explorer API and local PolyGlot `.bin` opening books.
  - Live ECO code identification and master-level move statistics breakdown during games and analysis.
- [ ] **Interactive Curriculum Hub:**
  - Structured module hierarchy: Tactics, Openings, Endgame Technique, Positional Pawn Structures.
  - Interactive board challenges: AI Coach sets up positions, evaluates user moves, and delivers hints without giving away solutions.
- [ ] **Adaptive Personalization:**
  - Analyze user's stored match history to detect recurring blunders or weak opening choices.
  - Auto-generate recommended lessons based on personal game telemetry.

---

## Phase 6: Fine-Tuned Chess Trainer Model

### Objective
Replace the general-purpose Ollama model with a small, fine-tuned LLM specialized in chess instruction, improving coaching accuracy, reducing hallucinations, and lowering inference cost.

### Requirements & Task Checklist
- [ ] **Dataset Curation:**
  - Build a supervised fine-tuning (SFT) dataset of (position, Stockfish evaluation, coach explanation) triples.
  - Source examples from annotated master games, Lichess Opening Explorer, and coach-generated explanations.
- [ ] **Model Selection & Training:**
  - Base model: small open-weight LLM (Qwen 7B family or smaller), fine-tuned with LoRA/QLoRA.
  - Evaluate with chess-specific metrics: move accuracy, evaluation agreement with Stockfish, and hallucination rate.
- [ ] **Serving & Cutover:**
  - Serve the fine-tuned model via Ollama (GGUF) or vLLM.
  - A/B test against the base model, then cut over the AI Coach pipeline once quality regressions clear.
