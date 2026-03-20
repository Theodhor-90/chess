# Master Plan — Chess Platform

## Product Goal

Online chess platform: two authenticated users play a live game via a shareable invite link. Server-authoritative rules, real-time moves, chess clocks, reconnection support. Post-game analysis with Stockfish engine, game database browser, computer opponents, tactical puzzles, a polished responsive UI, and a flagship opening explorer with repertoire builder and spaced-repetition training.

## MVP Scope (M0–M10)

The core platform and analysis features ship in milestones M0–M10:

1. **Core platform** (M0–M3) — Auth, game creation, real-time play, chess clocks, reconnection.
2. **Linear analysis** (M4) — Client-side Stockfish evaluates the game move-by-move. Eval bar, move classifications, accuracy scores, interactive move navigation.
3. **Branching** (M5) — Users can play alternative moves from any position, building a move tree with engine evaluation on each branch.
4. **Persistence** (M6) — Analysis results (including branches) are stored server-side so users don't recompute on revisit.
5. **Game history & profiles** (M8) — Usernames, game history with filtering, player profile pages.
6. **Server-side Stockfish** (M9) — Native Stockfish binary replaces client-side WASM.
7. **Game database browser** (M10) — PGN import, search, and viewer for external databases.

## UI Overhaul Scope (M11–M14)

The UI overhaul ships in four milestones:

1. **Design system foundation** (M11) — CSS Modules, design tokens, theme infrastructure, shared UI component library.
2. **Core page redesign** (M12) — Restyle every page using the design system: auth, dashboard, game, analysis, history, profile, database.
3. **Responsive design & mobile** (M13) — Flexible layouts, responsive board sizing, mobile navigation, touch UX.
4. **Theming, polish & accessibility** (M14) — Dark mode, board/piece themes, animations, sounds, WCAG accessibility.

## Engagement Features (M15–M16)

Features that keep players engaged between games:

1. **Computer bots** (M15) — Play against Stockfish at 5 difficulty levels with distinct bot personalities, think-time simulation, and move imperfection for lower levels.
2. **Tactical puzzles** (M16) — Import the Lichess puzzle database (~4M puzzles), serve rated puzzles matched to user skill, track puzzle ratings and solve statistics, interactive multi-move puzzle UI.

## Opening Explorer & Repertoire (M17–M19)

The platform's flagship feature, spanning three milestones:

1. **Opening Explorer** (M17) — Position-indexed three-tab explorer (masters, platform, engine) with per-move statistics, ECO classification, board arrows, and filtering by rating/speed/date.
2. **Repertoire Builder** (M18) — Personal opening stats overlay, repertoire tree management, PGN import/export, opponent preparation mode, coverage analysis.
3. **Repertoire Training** (M19) — FSRS spaced repetition, interactive line-based drill UI, scheduling dashboard, retention analytics, and training heatmaps.

## Non-Goals

- Live analysis during active games (this is cheating assistance)
- Free analysis board (paste arbitrary FEN/PGN with no game reference)
- Multiplayer / shared analysis sessions
- ~~Server-side engine execution~~ → moved to M9 (native Stockfish replaces client-side WASM)
- ~~Opening book / database integration~~ → moved to M17–M19 (flagship opening explorer with repertoire training)
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

### M11: Design System Foundation

**Goal:** Replace the current inline-styles-everywhere approach with a maintainable styling architecture. Establish CSS Modules, a design token system with CSS custom properties, a theme provider, and a shared UI component library that all subsequent milestones build on.

#### Phase 11.1 — CSS Modules, Design Tokens & Theme Provider

Adopt CSS Modules as the styling approach. Extract all hardcoded colors, spacing, typography, and radii into a design token system using CSS custom properties. Build a ThemeProvider that toggles a `data-theme` attribute on `<html>`. Migrate a few existing components as proof the pattern works end-to-end.

Exit criteria:

- Design tokens defined as CSS custom properties in a global stylesheet (`apps/web/src/styles/tokens.css`) covering colors, spacing, typography, borders, shadows.
- Global reset and base styles applied via `apps/web/src/styles/global.css`.
- `ThemeProvider` component sets `data-theme` on `<html>` (light only for now — dark tokens wired in M14).
- `NavHeader` and `Clock` migrated from inline styles to CSS Modules as proof of concept.
- All existing functionality preserved — no visual regressions in behavior.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 11.2 — Shared UI Component Library

Build a reusable component library using the design token system: Button, Card, Input, Select, Badge, Table, Modal, and Toast.

Exit criteria:

- `Button` component with variants (primary, secondary, danger, ghost), sizes (sm, md, lg), and loading state.
- `Card` component with optional header, consistent padding and shadow.
- `Input` and `Select` components with labels, placeholder, error state, disabled state.
- `Badge` component for colored chips (Win/Loss/Draw, time control labels).
- `Table` component with sortable columns, pagination, and horizontal scroll on overflow.
- `Modal` component with backdrop, focus trap, close on Escape, accessible markup.
- `Toast` notification system for ephemeral messages with auto-dismiss.
- All components use CSS Modules and design tokens. No inline styles.
- Components exported from a shared barrel file (`apps/web/src/components/ui/index.ts`).
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M12: Core Page Redesign

**Goal:** Restyle every page in the application using the M11 design system and component library. Each phase tackles a logical group of pages, migrating from inline styles to CSS Modules and replacing raw HTML elements with shared UI components.

#### Phase 12.1 — Layout Shell & Auth Pages

Redesign the app-level layout (NavHeader, page container) and the authentication pages (Login, Register).

Exit criteria:

- `NavHeader` redesigned: logo area, nav links with active route indicator, user dropdown (username + logout), structured for future mobile hamburger.
- App-level layout wrapper provides centered container with consistent page padding.
- `LoginPage` redesigned: centered card layout, styled form inputs, validation error display, branded appearance.
- `RegisterPage` redesigned: consistent with LoginPage, username field prominently placed.
- All inline styles removed from these components, replaced with CSS Modules + design tokens.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 12.2 — Dashboard & Game Management

Restyle the dashboard, game creation, game list, waiting screen, and join page.

Exit criteria:

- `DashboardPage` redesigned: game creation as a prominent Card with better form UX using shared Input/Select/Button.
- `GameList` redesigned: polished table (or card layout) showing opponent name, time control Badge, game status chip, result Badge for finished games.
- `WaitingScreen` redesigned: better invite link presentation with copy-to-clipboard Button, visual loading state.
- `JoinPage` redesigned: loading and error states with proper visual treatment using shared components.
- All inline styles removed from these components.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 12.3 — Game Page

Restyle the entire game page: board surroundings, clocks, move list, game actions, overlays, and add a promotion modal.

Exit criteria:

- Player info bars above and below the board showing username, clock, and captured pieces.
- `Clock` redesigned: styled clock face with urgency colors (red at low time), active/idle visual states.
- `MoveList` redesigned: alternating row colors, current-move highlight, smooth auto-scroll.
- `GameActions` redesigned: clear Button group for resign, draw offer, draw accept/decline.
- `GameOverOverlay` redesigned: proper Modal with game summary (result, reason, accuracy link), "Back to Dashboard" and "Analyze" CTAs.
- Promotion modal when a pawn reaches the last rank (currently auto-queens silently).
- `DisconnectBanner` and `ConnectionStatus` restyled with shared components.
- All inline styles removed from these components.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 12.4 — Analysis, Training & Database Pages

Restyle analysis, training, history, profile, and database pages.

Exit criteria:

- `AnalysisPage` redesigned: polished panel layout with Cards, better eval bar styling, engine lines in styled panels.
- `TrainingPage` redesigned: consistent layout with AnalysisPage, styled action buttons.
- `HistoryPage` redesigned: filter UI with shared Select/Badge components, result Badges in Table rows.
- `ProfilePage` redesigned: stat Cards with visual hierarchy, win/loss/draw breakdown with Badges.
- `DatabasePage` redesigned: filter panel in a Card with organized Input/Select groups, sortable Table with pagination.
- `DatabaseGameViewerPage` redesigned: consistent with AnalysisPage, metadata displayed in Cards.
- All inline styles removed from these components.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M13: Responsive Design & Mobile

**Goal:** Make the entire application work well on all screen sizes, from desktop to mobile phones. Flexible board sizing, stacked layouts on small screens, mobile navigation, and touch-friendly interactions.

#### Phase 13.1 — Responsive Layouts & Flexible Board

Replace fixed-width layouts with responsive designs. Make the chess board scale to the viewport.

Exit criteria:

- Chess board uses responsive sizing (`min(400px, 100vw - 2rem)`) instead of fixed 400px across all pages (game, analysis, training, database viewer).
- Game page stacks vertically on small screens: board on top, info panel (clocks, move list, actions) below.
- Dashboard uses single-column layout on mobile.
- Analysis and training pages stack board above engine panel on narrow screens.
- All Tables scroll horizontally with visual affordance on narrow screens.
- Typography scale adjustments for smaller viewports.
- Breakpoints defined as design tokens for consistency.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 13.2 — Mobile Navigation & Touch UX

Add mobile-specific navigation and touch interactions.

Exit criteria:

- `NavHeader` shows hamburger menu on mobile with slide-out or dropdown nav panel.
- All interactive elements meet 44px minimum touch target size.
- Swipe left/right gestures for move navigation on game and analysis pages.
- Bottom action bar on game page for mobile (resign, draw buttons accessible without scrolling).
- Promotion selector optimized for touch (large piece icons).
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M14: Theming, Polish & Accessibility

**Goal:** Add dark mode and board theme customization, visual polish through animations and sound effects, and comprehensive accessibility support.

#### Phase 14.1 — Dark Mode & Board Themes

Wire the ThemeProvider with dark mode values and add a user settings page for theme preferences.

Exit criteria:

- Dark mode token values defined in `tokens.css` under `[data-theme="dark"]`.
- Settings page at `/settings` with: theme toggle (light/dark/system), board theme picker (brown/blue/green/ic from Chessground CSS), piece set selector.
- Theme preference persisted in localStorage and optionally on user record via API.
- `prefers-color-scheme` media query respected when set to "system".
- All components render correctly in both light and dark themes.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 14.2 — Animations & Sound

Add micro-interactions, transitions, and sound effects throughout the application.

Exit criteria:

- Page route transition animations (fade or slide).
- Button hover and press micro-interactions (scale, color shift).
- Clock urgency animation (pulse or glow at low time).
- Move list smooth scroll to current move.
- Toast notification slide-in/out animation.
- Game over Modal entrance animation.
- Loading skeletons replace all "Loading..." text strings.
- Sound effects: move, capture, check, castle, game start, game end. Audio files in `apps/web/public/sounds/`.
- Mute toggle in settings page and persisted in localStorage.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 14.3 — Accessibility

Comprehensive accessibility audit and improvements to meet WCAG AA.

Exit criteria:

- ARIA labels on all interactive elements (buttons, links, form controls, board squares).
- Keyboard navigation for move list (arrow keys), game actions (Tab + Enter), and modals (Tab trap).
- Focus management: focus moves to modal on open, returns on close. Focus ring visible on all interactive elements.
- Screen reader announcements for moves, game state changes (check, checkmate, draw), and clock warnings.
- Color contrast audit — all text/background combinations meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
- `prefers-reduced-motion` media query disables all animations from Phase 14.2.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M15: Computer Bots

**Goal:** Let users play against computer opponents (Stockfish) at various difficulty levels. Bot games use the existing game infrastructure — the bot acts as a virtual player with server-side move generation, think-time simulation, and difficulty-appropriate move selection. Bot profiles offer named opponents at estimated Elo levels from beginner to master.

#### Phase 15.1 — Bot Backend

Define bot difficulty profiles, build a BotPlayer service that generates moves using the existing EnginePool, add a `botLevel` column to the games schema, and create a `POST /games/bot` endpoint that creates and immediately starts a bot game. Add shared types to `@chess/shared`.

Exit criteria:

- Bot profiles defined: name, difficulty level (1–5), estimated Elo, engine depth, error rate (probability of picking a non-best move from MultiPV), think time range (min/max ms).
- `botLevel` nullable integer column added to the `games` table. Non-null indicates a bot game.
- `BotPlayer` service: given a game state, selects a move by evaluating the position at the profile's depth, then probabilistically picks from MultiPV lines based on error rate. Waits a randomized think-time before returning.
- `POST /api/games/bot` endpoint: accepts `{ level: number, clock?: ClockConfig }`, creates a game with the bot as the opponent, sets status to `active`, makes the bot's first move if bot is white, and returns the game state.
- Bot move cycle: after a human move, the server schedules the bot's reply via BotPlayer, then calls `gameService.makeMove()` and emits socket events. Clock ticks for the bot like a normal player.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 15.2 — Bot Frontend

Bot selection page, GamePage integration for bot games, and bot identification in history/profile pages.

Exit criteria:

- `/play/bot` page with a bot selection grid: each profile shown as a card with name, estimated Elo, difficulty level indicator.
- Clicking a bot profile sends `POST /api/games/bot` and navigates to `/game/:id`.
- `GamePage` works with bot games without modification (bot moves arrive via existing socket events).
- Bot opponent shown with a "Bot" badge and bot name as username in the game page, game list, history, and profile pages.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M16: Tactical Puzzles

**Goal:** Import the Lichess puzzle database, serve rated puzzles matched to user skill, track puzzle ratings and solve statistics, and provide an interactive multi-move puzzle UI. Puzzles use request/response validation (not real-time sockets) with animated opponent moves on the Chessground board.

#### Phase 16.1 — Puzzle Import & Storage

Puzzle database schema, streaming CSV parser, CLI import tool, and shared types.

Exit criteria:

- `puzzles` table with indexed columns for rating, popularity, and themes.
- Streaming CSV parser handles the full Lichess puzzle CSV (~4M rows, ~300MB) without loading into memory.
- CLI import script processes all puzzles with progress reporting, batch inserts, and duplicate skipping.
- Shared types exported from `@chess/shared`.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 16.2 — Puzzle API & Rating System

REST endpoints for serving puzzles and validating attempts. Puzzle rating system for users.

Exit criteria:

- `puzzle_attempts` table for tracking solve history.
- `puzzleRating` and `puzzleRatingDeviation` columns on users table (default 1500 and 350).
- `GET /api/puzzles/next` serves a puzzle matched to the user's puzzle rating.
- `POST /api/puzzles/:puzzleId/attempt` validates the full solution move sequence, updates user puzzle rating, records the attempt.
- `GET /api/puzzles/stats` returns user's puzzle rating, total attempts, solve rate, and recent history.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 16.3 — Puzzle Frontend

Interactive puzzle page with Chessground board, multi-move puzzle flow, success/fail feedback, and puzzle stats display.

Exit criteria:

- `/puzzles` page with puzzle board, stats panel, and theme badges.
- Multi-move puzzle flow: setup move animation → user plays → validate → animate opponent response → repeat until solved or failed.
- Correct/incorrect move visual feedback (green/red highlights, snap-back on wrong move).
- Rating change display on solve/fail, "Next Puzzle" button.
- Navigation link in header and dashboard quick link.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

## Opening Explorer & Repertoire Scope (M17–M19)

The platform's flagship feature: a multi-source opening explorer, personal repertoire builder, and spaced-repetition training system.

1. **Opening Explorer** (M17) — Position-indexed opening database with three data sources (masters, platform games, engine), FEN-keyed statistics, ECO/opening name classification, board arrows, and filtering.
2. **Repertoire Builder** (M18) — Personal opening statistics overlay, repertoire tree management (mark preferred moves, build/edit/import lines), opponent preparation mode, and integration with the analysis board.
3. **Repertoire Training** (M19) — FSRS-based spaced repetition scheduler, interactive drill UI, line-based training with board context, scheduling dashboard, and training statistics.

### Tech Stack Additions

| Layer                  | Choice                                            | Rationale                                                                    |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Opening classification | Lichess `chess-openings` TSV (CC0, 3,641 entries) | Standard dataset, FEN-keyed, handles transpositions, same source as Lichess  |
| Position indexing      | SQLite aggregate tables (FEN-keyed)               | Consistent with existing stack, no new infrastructure needed                 |
| Explorer arrows        | Chessground `drawable.autoShapes`                 | Already installed; supports custom brushes, per-shape lineWidth modifiers    |
| SRS algorithm          | FSRS via `ts-fsrs`                                | State-of-the-art, 20-30% fewer reviews than SM-2, TypeScript, zero deps, MIT |

### Architecture Decisions

#### Position-Based Indexing (Not Move-Order)

The opening explorer is keyed by **board position** (FEN with side-to-move, castling, en passant), not by the sequence of moves that reached it. This means transpositions are automatically merged — 1.d4 Nf6 2.c4 and 1.c4 Nf6 2.d4 show the same statistics. All major platforms (Lichess, Chess.com, ChessBase) use this approach.

#### Three-Tab Explorer Pattern

Every major platform converges on three data sources: Masters (curated OTB games), Community (platform games), and Engine (Stockfish evaluation). We adopt this pattern with tabs for Masters, Platform, and Engine.

#### Explorer Board Arrows

Following Chess.com's most-praised UX innovation: arrows are drawn directly on the board showing candidate moves. Arrow thickness encodes popularity (game count), arrow color encodes success rate (green = good for side to move). Uses Chessground's `autoShapes` API with custom brushes and per-shape `modifiers.lineWidth`.

#### Repertoire Card Model

One SRS card per `(position_fen, correct_move, side)` tuple. Only the user's own moves are scheduled for review; opponent moves are context/prompts. FEN is normalized (strip halfmove clock and fullmove number) to handle transpositions. Training presents full lines from the starting position, not isolated positions.

---

### M17: Opening Explorer

**Goal:** Build a position-indexed opening explorer with three data sources (masters games, platform games, server-side engine evaluation), per-move statistics (win/draw/loss, game count, average rating), ECO/opening name classification, explorer arrows on the board, and filtering by rating range, time control, and date range. The explorer integrates into the existing analysis board as a toggleable panel.

#### Phase 17.1 — Opening Data Infrastructure

Opening classification system, position-indexed statistics tables, and masters game aggregation pipeline.

Exit criteria:

- Lichess `chess-openings` TSV data bundled as JSON at build time. `Map<string, { eco: string; name: string }>` keyed by FEN. Lookup function: given a FEN, return the opening name or `null`.
- New `opening_positions` table: `positionFen` (TEXT, PK), `eco` (TEXT), `openingName` (TEXT), `masterStats` (JSON: `{ white, draws, black, totalGames, avgRating }`), `platformStats` (JSON: same shape, partitioned by rating bracket and speed).
- Aggregation script that processes the existing `database_games` table (M10 masters import) into `opening_positions` stats. For each game: replay moves via chess.js, at each position update the aggregate stats. Handles batch processing with progress reporting.
- Platform game aggregation: after each completed game on the platform, a background job updates `opening_positions.platformStats` for each position in the game. Stats are bucketed by rating bracket (0–1000, 1000–1200, ..., 2200+) and speed (bullet, blitz, rapid, classical).
- Opening name assigned to games: `openingEco` and `openingName` columns added to the `games` table, populated on game completion by walking the move list against the opening classification map.
- Shared types exported from `@chess/shared`: `OpeningInfo`, `PositionStats`, `ExplorerMove`, `ExplorerResponse`, `ExplorerFilter`, `RatingBracket`, `SpeedCategory`.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 17.2 — Explorer API

REST endpoints for querying opening statistics from all three data sources with filtering.

Exit criteria:

- `GET /api/explorer/masters?fen=...&since=&until=` — Returns moves from the masters database for the given position. Each move includes: `san`, `uci`, `white` (wins), `draws`, `black` (wins), `totalGames`, `avgRating`, `opening` (name/eco after this move). Sorted by `totalGames` descending. Includes `topGames` array (up to 8 notable games at this position, sorted by combined rating).
- `GET /api/explorer/platform?fen=...&ratings=&speeds=&since=&until=` — Same response shape but from platform games. `ratings` param accepts comma-separated brackets (e.g., `1400,1600,1800`). `speeds` param accepts comma-separated categories. Date range filters by `since`/`until` in YYYY-MM format.
- `GET /api/explorer/player?fen=...&userId=&color=&speeds=&since=&until=` — Per-player opening stats. Returns the same move-level stats filtered to a single player's games as the specified color.
- `POST /api/explorer/engine?fen=` — Evaluates the position with server-side Stockfish (reuses existing engine pool). Returns top 3 lines with scores, best moves in SAN/UCI, and depth. Uses existing `evaluatePosition` socket event infrastructure but exposed as a REST endpoint for the explorer.
- All endpoints return an `opening` field with the current position's ECO code and name (or `null` if beyond book).
- Input validation: FEN format validation, rating bracket validation, date format validation.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 17.3 — Explorer Frontend

Three-tab explorer panel integrated into the analysis board with move table, statistics bars, board arrows, and filtering controls.

Exit criteria:

- Explorer panel added to the analysis page as a toggleable side panel (book icon toggle, similar to Lichess). Three tabs: Masters, Platform, Engine.
- **Move table**: Each row shows move SAN, game count, horizontal stacked bar (white wins | draws | black wins) with percentage labels, average rating. Sorted by total games descending. Clicking a move plays it on the board and updates the explorer.
- **Explorer arrows on the board**: Top 5 moves drawn as arrows via Chessground `autoShapes`. Arrow thickness scales with game count (lineWidth 3–15 proportional to `move.totalGames / maxTotalGames`). Arrow color uses custom brushes: green-tinted for moves with >55% score, neutral for 45–55%, red-tinted for <45%. Arrows update on position change.
- **Opening name display**: Current position's ECO code and opening name displayed above the move table. Updates as the user navigates moves. Links to a future opening page (placeholder for now).
- **Top games section**: Below the move table, a list of up to 8 notable games at this position showing player names, ratings, result, and year. Clickable to open in the database game viewer.
- **Filter controls**: Masters tab: date range (year pickers). Platform tab: rating bracket checkboxes, speed category checkboxes, date range. Player tab: user search input, color selector (white/black), speed/date filters.
- **Engine tab**: Shows top 3 engine lines with evaluation scores, move sequences, and depth. Reuses existing `EngineLinesPanel` component styling. Evaluates on tab switch (not on page load).
- **Hover interaction**: Hovering over a move in the table highlights the corresponding arrow on the board.
- **Empty state**: When a position has no data, show "No games found in this position" with suggestion to try a different database tab.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M18: Repertoire Builder

**Goal:** Personal opening statistics overlay on the explorer, a full repertoire tree builder where users mark preferred moves and build complete opening lines, repertoire import/export via PGN, opponent preparation mode, and deep integration with the analysis board and explorer.

#### Phase 18.1 — Personal Opening Stats

Per-user opening statistics computed from their platform games, displayed as an overlay on the explorer and as a standalone stats view.

Exit criteria:

- `opening_player_stats` table: `userId` (FK), `positionFen` (TEXT), `color` (TEXT), `white` (wins), `draws`, `black` (wins), `totalGames`, `avgRating`, composite PK on `(userId, positionFen, color)`.
- Stats populated from existing game history on first request (background job processes all user's completed games). Incrementally updated after each new completed game.
- `GET /api/explorer/personal?fen=...&color=` — Returns the authenticated user's stats for each move from the given position. Same response shape as other explorer tabs but scoped to the user's games.
- Personal stats tab added to the explorer panel (4th tab: "My Games"). Shows the user's own win/draw/loss rates per move, game count, and links to their actual games in that line.
- **Stats overlay mode**: When enabled via a toggle, personal stats appear as a secondary row below each move in the Masters/Platform tabs — showing "You: 3W / 1D / 2L" alongside the global stats. Visual comparison of personal vs. global performance.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 18.2 — Repertoire Tree Management

Backend and data model for building, editing, and storing opening repertoires as move trees.

Exit criteria:

- `repertoires` table: `id`, `userId` (FK), `name` (TEXT), `color` (TEXT: 'white' | 'black'), `description` (TEXT, nullable), `createdAt`, `updatedAt`.
- `repertoire_moves` table: `id`, `repertoireId` (FK), `positionFen` (TEXT, normalized — strip halfmove clock and fullmove number), `moveSan` (TEXT), `moveUci` (TEXT), `resultFen` (TEXT, normalized), `isMainLine` (BOOLEAN), `comment` (TEXT, nullable), `sortOrder` (INTEGER). Unique constraint on `(repertoireId, positionFen, moveSan)`.
- `POST /api/repertoires` — Create a new repertoire (name, color, optional description).
- `GET /api/repertoires` — List user's repertoires with move counts and last-updated timestamps.
- `GET /api/repertoires/:id` — Full repertoire tree as nested JSON (same `SerializedAnalysisNode`-like structure but with repertoire-specific fields: `isMainLine`, `comment`).
- `PUT /api/repertoires/:id` — Update name/description.
- `DELETE /api/repertoires/:id` — Delete repertoire and all its moves.
- `POST /api/repertoires/:id/moves` — Add a move at a position (positionFen, moveSan). Server validates the move is legal via chess.js, computes resultFen, stores.
- `DELETE /api/repertoires/:id/moves/:moveId` — Remove a move and all its descendants from the tree.
- `PUT /api/repertoires/:id/moves/:moveId` — Update comment, isMainLine flag, sortOrder.
- `POST /api/repertoires/:id/import` — Import from PGN string. Parses PGN including all variations/sidelines recursively, deduplicates by `(positionFen, moveSan)`, bulk-inserts.
- `GET /api/repertoires/:id/export` — Export as PGN string with variations.
- Tree operations maintain referential integrity — deleting a branch removes all descendant moves.
- Shared types: `Repertoire`, `RepertoireMove`, `RepertoireTree`, `RepertoireImportRequest`.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 18.3 — Repertoire Builder Frontend

Interactive repertoire building UI integrated with the analysis board and opening explorer.

Exit criteria:

- `/repertoires` page listing the user's repertoires as cards (name, color indicator, move count, coverage percentage, last updated). "New Repertoire" button.
- `/repertoires/:id` page with the full repertoire builder: Chessground board + move tree panel + explorer panel side by side.
- **Building flow**: The board is interactive (not view-only). User navigates using the explorer to find moves, then clicks "Add to Repertoire" (or a keyboard shortcut) to mark the current move as their preferred response. The move tree panel shows the growing repertoire.
- **Move tree panel**: Displays the repertoire as a nested move list with main lines and sidelines (indented variations). Current position highlighted. Clickable to navigate. Context menu per move: set as main line, add comment, delete branch.
- **Explorer integration**: The opening explorer panel is visible alongside the repertoire builder. Explorer stats inform the user's choice of which move to add. When viewing a position, moves already in the repertoire are visually marked (checkmark icon) in the explorer move table.
- **Board arrows for repertoire**: Repertoire moves are shown as arrows on the board (green for main line, blue for sidelines). Explorer arrows shown in a dimmer palette underneath.
- **PGN import**: Modal with a textarea to paste PGN. Preview shows the parsed tree before confirming import. Handles variations, comments, and NAGs.
- **PGN export**: Download button that exports the repertoire as a `.pgn` file.
- **Opponent preparation mode**: Select an opponent (by username search). The explorer's Player tab loads that opponent's stats. Repertoire builder highlights positions where the opponent's most-played move deviates from your repertoire (gap indicator).
- **Coverage indicator**: For each branch point in the repertoire, show whether all major opponent responses (>5% frequency in the explorer) have a repertoire move. "Coverage: 85%" per variation.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

### M19: Repertoire Training

**Goal:** Train opening repertoires using FSRS spaced repetition. Interactive drill UI presents full lines on the board — the system plays opponent moves, the user plays their repertoire moves. Scheduling dashboard shows due reviews, learning progress, and retention statistics. The training loop handles correct/incorrect responses, animated opponent moves, hints, and post-session summaries.

#### Phase 19.1 — SRS Scheduling Backend

FSRS-based scheduling engine, card generation from repertoire trees, review endpoints, and training statistics.

Exit criteria:

- `ts-fsrs` package installed as a dependency of `@chess/api`.
- `repertoire_cards` table: `id`, `repertoireId` (FK), `positionFen` (TEXT, normalized), `moveSan` (TEXT), `moveUci` (TEXT), `resultFen` (TEXT), `side` (TEXT), `due` (INTEGER, unix timestamp), `stability` (REAL), `difficulty` (REAL), `elapsedDays` (INTEGER), `scheduledDays` (INTEGER), `learningSteps` (INTEGER), `reps` (INTEGER), `lapses` (INTEGER), `state` (INTEGER: 0=New, 1=Learning, 2=Review, 3=Relearning), `lastReview` (INTEGER, nullable). Unique constraint on `(repertoireId, positionFen, moveSan)`.
- `review_logs` table: `id`, `cardId` (FK), `rating` (INTEGER, 1–4), `state` (INTEGER), `due` (INTEGER), `stability` (REAL), `difficulty` (REAL), `elapsedDays` (INTEGER), `scheduledDays` (INTEGER), `reviewedAt` (INTEGER). For future FSRS parameter personalization.
- Card generation: when a repertoire is modified (move added/removed), cards are synced. Adding a move creates a card with FSRS `createEmptyCard()` defaults. Removing a move deletes the card and its review logs. Only "own moves" (user's side) become cards; opponent moves are context.
- `GET /api/repertoires/:id/train/next` — Returns the next training line: a sequence of `{ fen, san, uci, isUserMove, isDue }` from the starting position to a leaf, containing at least one due card. Line selection: BFS from starting position, prioritizing lines with the most due cards. Includes the count of remaining due cards.
- `POST /api/repertoires/:id/train/review` — Submit a review: `{ cardId, rating }`. Server runs `fsrs.next(card, now, rating)`, updates the card, inserts a review log, returns the updated card state and next interval.
- `GET /api/repertoires/:id/train/stats` — Training statistics: total cards, new/learning/review/relearning counts, due today, due tomorrow, average retention (estimated from stability and elapsed time), streak (consecutive days with reviews), total reviews.
- FSRS parameters configurable per user (future): `requestRetention` (default 0.9), `maximumInterval` (default 365 days), `enableFuzz` (default true).
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 19.2 — Training Frontend

Interactive drill UI with board-based line training, animated opponent moves, feedback, and session management.

Exit criteria:

- `/repertoires/:id/train` page with Chessground board, progress panel, and session controls.
- **Training flow**: (1) System loads a line via `GET .../train/next`. (2) Board shows the starting position. (3) System animates opponent moves (the non-user moves) with a brief delay (300ms). (4) At each user-move position, the board becomes interactive — user must play the correct move. (5) Correct move: green highlight, "Good!" feedback, advance to next position. (6) Wrong move: red highlight, snap-back animation (300ms), show the correct move as a green arrow, mark as `Rating.Again`. (7) Repeat until the line is complete. (8) After each user move, `POST .../train/review` is called with the appropriate rating.
- **Rating determination**: Wrong move = `Again(1)`. Correct move with hint used = `Hard(2)`. Correct move (normal) = `Good(3)`. Correct move under 2 seconds = `Easy(4)`. Response timer starts when the board becomes interactive.
- **Hint system**: A "Show Hint" button reveals the destination square of the correct move (highlights it in yellow) without revealing the piece or origin. Uses `Again` → `Hard` penalty if used.
- **Progress panel**: Shows current line progress (move X of Y), session stats (correct/incorrect/remaining), due card count, and current repertoire retention percentage.
- **Session summary**: After all due cards are reviewed (or user ends session), show a summary modal: cards reviewed, new cards learned, accuracy percentage, next review due date, retention estimate. "Continue" button for overdue cards, "Done" button to return to repertoire page.
- **Keyboard shortcuts**: Enter to confirm move, H for hint, Escape to end session, arrow keys disabled during training (prevent peeking ahead).
- **Empty state**: When no cards are due, show "All caught up! Next review due in X hours/days" with option to study new cards ahead of schedule.
- Navigation: "Train" button on each repertoire card in `/repertoires`, and within the repertoire builder page.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

#### Phase 19.3 — Training Dashboard & Analytics

Cross-repertoire training dashboard, learning analytics, heatmaps, and retention forecasting.

Exit criteria:

- `/training` page (accessible from nav header) showing a unified dashboard across all repertoires.
- **Daily review summary**: Total cards due today across all repertoires, broken down by repertoire. One-click "Start Training" button that queues due cards from all repertoires.
- **Calendar heatmap**: GitHub-style contribution grid showing daily review activity over the last 6 months. Color intensity = number of reviews that day. Current streak prominently displayed.
- **Per-repertoire stats cards**: For each repertoire, show: total cards, mastered (state=Review with stability >30 days), learning, new, due today, estimated daily review time (based on average review speed), retention percentage.
- **Difficult positions**: List of the 10 cards with highest lapse count (most frequently forgotten). Each shows the position as a mini-board thumbnail, the correct move, lapse count, and current stability. Clicking opens the repertoire builder at that position.
- **Retention forecast**: A line chart projecting the user's retention over the next 30 days assuming they complete all scheduled reviews. Uses FSRS retrievability formula `R = 0.9^(t/S)` across all cards.
- **Learning velocity**: Chart showing new cards learned per day over the last 30 days, with a trend line.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass.

---

## Cross-Milestone Standards

- All existing platform conventions apply (ESM, strict TypeScript, named exports, Prettier, ESLint).
- The analysis feature must not interfere with live gameplay — active game guard is enforced.
- Stockfish WASM assets must be properly bundled/served by Vite (not loaded from external CDN).
- ~~No backend compute for engine evaluation~~ — As of M9, Stockfish runs server-side via native binary.
- Shared types for analysis data structures go in `@chess/shared`.
- Tests cover engine service, move tree logic, and API endpoints.
