# AI Chess Coach & Platform — Product Requirement Document (PRD)

## Architectural Overview & Tech Stack

* **Frontend:** Next.js (React), Tailwind CSS (Mobile-First Design)
* **Chess Core & UI:** `chess.js` (rule validation, FEN/PGN generation), `react-chessboard` (interactive board renderer)
* **Chess Engine:** `stockfish.js` / WebAssembly (client-side engine execution via Web Workers)
* **Backend & Realtime:** Node.js (Next.js API Routes / App Router) or Python (FastAPI), WebSockets / Supabase Realtime
* **Database & Auth:** PostgreSQL with Prisma / Supabase ORM, Auth.js / Supabase Auth
* **AI Coach Engine:** Ollama (`qwen2.5:7b-instruct` or `llama3.1:8b`), PolyGlot opening books (`.bin`), Lichess Opening Explorer API

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
  - Load `stockfish.js` inside a Web Worker to ensure UI thread remains non-blocking during heavy calculations.
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
  - WebSockets or Supabase Realtime synchronization layer.
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
  - API endpoint forwarding structured context to Ollama (`qwen2.5:7b-instruct`).
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
