# Master Plan — Game Analysis Feature

## Product Goal

Allow users to analyze their completed games with a Stockfish-powered analysis board. Engine evaluates every move, classifies accuracy, and lets users explore alternative lines — similar to chess.com's post-game analysis.

## MVP Scope

The feature ships in three milestones:

1. **Linear analysis** — Client-side Stockfish evaluates the game move-by-move. Eval bar, move classifications, accuracy scores, interactive move navigation.
2. **Branching** — Users can play alternative moves from any position, building a move tree with engine evaluation on each branch.
3. **Persistence** — Analysis results (including branches) are stored server-side so users don't recompute on revisit.

## Non-Goals

- Live analysis during active games (this is cheating assistance)
- Free analysis board (paste arbitrary FEN/PGN with no game reference)
- Multiplayer / shared analysis sessions
- ~~Server-side engine execution~~ → moved to M9 (native Stockfish replaces client-side WASM)
- Opening book / database integration
- Tablebase endgame lookup

---

## Tech Stack (additions to existing platform)

| Layer            | Choice                   | Rationale                                                                                           |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| Chess engine     | lila-stockfish-web       | Lichess's Stockfish WASM build, battle-tested, supports Web Workers, multi-threaded where available |
| Engine execution | Web Worker (client-side) | No backend compute cost, runs entirely in the user's browser                                        |
| Analysis depth   | 18 ply                   | Good balance of accuracy vs. computation time for browser-based analysis                            |
| Move tree model  | In-memory tree structure | Supports branching with parent/child relationships, serializable for persistence                    |

### Existing Stack (unchanged)

- **Backend**: Fastify 5, Drizzle ORM, better-sqlite3, Socket.io
- **Frontend**: Vite 6, React 19, Chessground, chess.js
- **Shared types**: `@chess/shared`

---

## Architecture Decisions

### Active Game Guard

Users must not access the analysis board while they have an active game. The analysis page checks for active games on load and displays an error message ("Can't use the analysis board while playing a game") if one exists. This prevents using the engine as a cheating tool during live play.

### Client-Side Engine

Stockfish runs entirely in the browser via lila-stockfish-web WASM. The engine communicates with the main thread through a Web Worker using the UCI protocol. This eliminates backend compute requirements and scaling concerns.

### Move Tree Data Model

Analysis data is modeled as a tree, not a flat list. Each node contains:

- Position (FEN)
- Evaluation (centipawns or mate-in-N)
- Move classification (best, good, inaccuracy, mistake, blunder)
- SAN notation of the move that led to this position
- Children (alternative moves explored by the user)

The main game line is the trunk. User-explored alternatives are branches. This structure supports arbitrary depth branching, same as chess.com.

### Analysis Trigger

Analysis does not auto-start. The user must click an "Analyze" button (styled prominently to attract attention). This respects the user's CPU and gives them control over when computation begins.

---

## Milestones

### M4: Linear Analysis

**Goal:** Users can open a completed game in an analysis board that evaluates every move with Stockfish, displays an eval bar, classifies each move, and shows per-player accuracy scores. Navigation via clickable move list and arrow keys.

#### Phase 4.1 — Stockfish Integration

Set up lila-stockfish-web in a Web Worker with UCI communication. Build a service layer that accepts a FEN position and returns evaluation (centipawns/mate score + best line).

Exit criteria:

- Stockfish WASM loads in a Web Worker without blocking the UI thread.
- A TypeScript service wraps UCI protocol: `evaluate(fen) → { score, bestLine, depth }`.
- Engine analyzes at depth 18.
- Service handles initialization, ready state, and cleanup (terminate worker).
- Unit tests verify evaluation returns valid scores for known positions.

#### Phase 4.2 — Analysis Page & Navigation

Create the analysis route and page with move-by-move navigation. Reuse Chessground for the board and build an interactive move list.

Exit criteria:

- Route `/analysis/:gameId` loads a completed game's PGN and renders the board.
- Active game guard: if the user has an active game, show error message instead of analysis board.
- Clickable move list highlights the current move and navigates the board to that position.
- Arrow keys (left/right) navigate backward/forward through moves.
- Board updates position on navigation (no engine evaluation yet in this phase).
- "Analyze" button is prominently styled and visible, but non-functional in this phase.
- Link to analysis page is accessible from the dashboard for completed games.

#### Phase 4.3 — Evaluation & Classification

Wire Stockfish evaluation into the analysis page. Evaluate every position, classify moves, compute accuracy scores, and display the eval bar.

Exit criteria:

- Clicking "Analyze" starts Stockfish evaluation of every position in the game sequentially.
- Eval bar displays alongside the board, updating as the user navigates moves.
- Each move is classified: best, good, inaccuracy, mistake, blunder (based on centipawn loss thresholds).
- Move list shows classification indicators (colored dots or icons) next to each move.
- Per-player accuracy score is computed and displayed (percentage based on centipawn loss).
- Analysis state is maintained in memory — navigating moves shows cached evaluation without recomputing.

---

### M5: Branching

**Goal:** Users can play alternative moves from any position in the analysis board. Each alternative is evaluated by Stockfish and displayed as a branch in the move tree.

#### Phase 5.1 — Move Tree Data Model

Implement the in-memory move tree structure that supports the main line and user-created branches.

Exit criteria:

- Tree data structure with nodes containing: FEN, eval, classification, SAN, children.
- Main game line initializes the trunk of the tree from PGN.
- API to add a child node at any position (user plays an alternative move).
- API to navigate the tree: go to parent, go to child (by index), go to main line, go to variation.
- Tree is serializable to JSON (for future persistence).
- Unit tests cover tree construction, navigation, and branch insertion.

#### Phase 5.2 — Branch UI & Interaction

Enable the user to play moves on the analysis board and display the resulting branch structure in the move list.

Exit criteria:

- User can make moves on the board from any position during analysis (Chessground allows interaction).
- Playing a move that differs from the game creates a branch in the move tree.
- Playing the same move as the game continues along the main line (no duplicate branch).
- Move list renders branches as indented variations (nested under the branch point), same pattern as chess.com.
- User can click any move in any branch to navigate there.
- Arrow keys navigate within the current variation; up/down switch between variations at branch points.
- Stockfish evaluates new positions as they are played, with eval bar updating.
- Branch moves receive classification based on evaluation.

---

### M6: Persistence

**Goal:** Analysis results (evaluations, classifications, accuracy scores, and branch trees) are stored server-side so returning to an analyzed game loads results instantly.

#### Phase 6.1 — Analysis Storage

Backend API and database schema for storing and retrieving analysis results.

Exit criteria:

- New `game_analyses` table: game_id (FK), analysis_tree (JSON), white_accuracy, black_accuracy, engine_depth, created_at.
- `POST /games/:id/analysis` saves the serialized analysis tree and accuracy scores.
- `GET /games/:id/analysis` retrieves stored analysis (404 if none exists).
- Endpoints are authenticated — users can only save/retrieve analysis for their own games.
- Drizzle migration adds the new table.

#### Phase 6.2 — Frontend Persistence Integration

Wire the frontend to save analysis results after computation and load them on revisit.

Exit criteria:

- After analysis completes, results are automatically POSTed to the server.
- When opening `/analysis/:gameId`, the page first checks for stored results via GET.
- If stored results exist, the analysis loads instantly (no Stockfish computation).
- If no stored results, the page shows the "Analyze" button as before.
- Saving a new analysis (with branches) overwrites the previous stored result.
- User-created branches are included in the persisted tree.

---

### M8: Game History & Player Profiles

**Goal:** Users can browse their full game history with filtering and sorting, view detailed player profiles with win/loss/draw statistics and accuracy trends, and see usernames instead of user IDs throughout the app.

#### Phase 8.1 — Usernames & Game History

Add a username field to user accounts (chosen at registration, displayed everywhere). Build a dedicated game history page with server-side pagination, filtering by result (win/loss/draw), and sorting by date.

Exit criteria:

- Users table has a `username` column (unique, 3–20 chars, alphanumeric + underscores).
- Registration requires a username. Login continues to use email.
- All UI surfaces show usernames instead of "User #123".
- `GET /games/history?page=1&limit=20&result=win&sort=newest` returns paginated game history.
- `/history` page renders a paginated, filterable table of completed games.
- Each row shows: opponent username, result (W/L/D), result reason, time control, date.
- Clicking a row navigates to the analysis page for that game.

#### Phase 8.2 — Player Profiles & Statistics

Build player profile pages with aggregate statistics and a recent games section. Each user gets a public profile showing their record and average accuracy.

Exit criteria:

- `GET /users/:id/stats` returns: total games, wins, losses, draws, win rate, average accuracy (white & black), and results of last 10 games.
- `/profile/:id` page displays the user's username, stats dashboard, and recent games.
- Stats include: total games played, win/loss/draw counts with percentages, average analysis accuracy.
- Recent games section shows last 10 games with opponent, result, and date.
- Nav header shows the logged-in user's username, clickable to their own profile.
- Opponent names in game history and game pages link to opponent profiles.

---

### M9: Server-Side Stockfish Engine

**Goal:** Replace client-side WASM Stockfish with a native Stockfish binary running server-side. Native Stockfish with NNUE is 3-5x faster than the WASM build, provides consistent performance across devices, and unblocks future features (background analysis, bot opponents).

#### Phase 9.1 — Engine Infrastructure, API & Frontend Migration

Build a UCI engine wrapper that spawns native Stockfish as a child process, a pool to manage multiple engine instances, REST endpoints for single-position and batch game analysis, and migrate the frontend from WASM to server API calls.

Exit criteria:

- `UciEngine` class spawns Stockfish, communicates via UCI, returns `EvaluationResult`.
- `EnginePool` manages N engines with request queuing and crash recovery.
- `POST /engine/evaluate` evaluates a single FEN. `POST /games/:id/server-analyze` batch-analyzes a completed game.
- Frontend uses server endpoints for all analysis. `lila-stockfish-web` is removed.
- Analysis depth increased to 20 (from 18 client-side).

---

### M10: Game Database Browser

**Goal:** Users can browse, search, and view games from external PGN databases (Lichess elite database). Games are imported into a separate SQLite database via CLI, queryable through a REST API, and viewable in the existing analysis board with optional engine evaluation.

#### Phase 10.1 — PGN Import & Storage

Parse large PGN files and store games in a separate SQLite database (`databases/games.db`) for fast querying. Provide a streaming PGN parser, a CLI import tool, and shared types.

Exit criteria:

- `database_games` table in a separate SQLite database with indexed columns for all header fields.
- Streaming PGN parser handles 400MB+ files without loading them into memory.
- CLI import script processes ~425K games in under 2 minutes with progress reporting and duplicate skipping.
- `DatabaseGame`, `DatabaseGameFilter`, `PaginatedResponse` types exported from `@chess/shared`.

#### Phase 10.2 — Browse API & Game Viewer

REST API for querying imported games with filtering, sorting, and pagination. Frontend browser page with a filterable table. Game viewer that reuses the analysis page infrastructure.

Exit criteria:

- `GET /database/games` supports filtering by player, Elo range, ECO, opening, result, date range, time control, termination. Paginated and sortable.
- `/database` page renders a filterable, paginated game table with URL-persisted filter state.
- Clicking a game opens a viewer with Chessground board and move-by-move navigation.
- "Analyze with engine" triggers server-side Stockfish evaluation on the database game.

---

## Cross-Milestone Standards

- All existing platform conventions apply (ESM, strict TypeScript, named exports, Prettier, ESLint).
- The analysis feature must not interfere with live gameplay — active game guard is enforced.
- Stockfish WASM assets must be properly bundled/served by Vite (not loaded from external CDN).
- ~~No backend compute for engine evaluation~~ — As of M9, Stockfish runs server-side via native binary.
- Shared types for analysis data structures go in `@chess/shared`.
- Tests cover engine service, move tree logic, and API endpoints.
