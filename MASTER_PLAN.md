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
- Server-side engine execution (all computation is client-side via WASM)
- Opening book / database integration
- Tablebase endgame lookup

---

## Tech Stack (additions to existing platform)

| Layer            | Choice                  | Rationale                                                                                         |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| Chess engine     | lila-stockfish-web      | Lichess's Stockfish WASM build, battle-tested, supports Web Workers, multi-threaded where available |
| Engine execution | Web Worker (client-side) | No backend compute cost, runs entirely in the user's browser                                      |
| Analysis depth   | 18 ply                  | Good balance of accuracy vs. computation time for browser-based analysis                          |
| Move tree model  | In-memory tree structure | Supports branching with parent/child relationships, serializable for persistence                  |

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

## Cross-Milestone Standards

- All existing platform conventions apply (ESM, strict TypeScript, named exports, Prettier, ESLint).
- The analysis feature must not interfere with live gameplay — active game guard is enforced.
- Stockfish WASM assets must be properly bundled/served by Vite (not loaded from external CDN).
- No backend compute for engine evaluation — all Stockfish runs client-side.
- Shared types for analysis data structures go in `@chess/shared`.
- Tests cover engine service, move tree logic, and API endpoints.
