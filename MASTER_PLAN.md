# Master Plan — Online Chess Platform MVP

## Product Goal

Enable two authenticated users to play a live online chess game by sharing an invite link. Server-authoritative rules, real-time moves, chess clocks, and reconnection support.

## MVP Scope

The MVP ships exactly three user-facing capabilities:

1. **Authentication** — Register and login with email/password.
2. **Game creation** — Create a game, receive a shareable invite link.
3. **Live play** — Opponent opens link, joins game, both play in real time with clocks.

## Non-Goals (MVP)

- Matchmaking / lobby / seek queue
- Rating system (ELO)
- AI opponent
- Tournaments
- Social features (friends, chat, clubs)
- Spectating
- Game analysis / engine integration
- Native mobile apps
- OAuth / social login
- Anti-cheat

---

## Tech Stack

| Layer          | Choice                             | Rationale                                                                                                                                         |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language       | TypeScript                         | Shared types across frontend/backend; both AI models excel with it                                                                                |
| Backend        | Fastify                            | High performance, built-in schema validation, first-class WebSocket plugin                                                                        |
| Database       | SQLite (dev + MVP) via Drizzle ORM | Zero infrastructure locally, handles 10k users for chess workload. Drizzle abstracts the driver so PostgreSQL swap is a config change when needed |
| Realtime       | Socket.io                          | Built-in reconnection, rooms, acknowledgements, documented Redis adapter for future horizontal scaling                                            |
| Auth           | Session cookies + bcrypt           | Simplest approach for friends-and-family launch. Sessions stored in-memory (single server), move to Redis-backed when scaling horizontally        |
| Frontend       | Vite + React + TypeScript          | SPA — no SSR needed for a game interface                                                                                                          |
| Chess board UI | Chessground (MIT, from lichess)    | Battle-tested interactive board with drag/drop, legal-move hints, animations, mobile touch. Eliminates weeks of frontend work                     |
| Chess logic    | chess.js (BSD)                     | Move validation, FEN/PGN, game-over detection. Used on both client (optimistic moves) and server (authoritative validation)                       |
| Monorepo       | pnpm workspaces                    | Shared types package between frontend and backend, single CI pipeline                                                                             |
| Deployment     | Single VPS (Fly.io or Hetzner)     | WebSocket requires persistent server. One $5-10/month box handles MVP load                                                                        |
| CI             | GitHub Actions                     | Lint, typecheck, test on every PR                                                                                                                 |

### Scaling Path

| Phase      | Users    | Changes needed                                                                                                                                                 |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MVP launch | 0 – 1k   | None. SQLite + single VPS.                                                                                                                                     |
| Growth     | 1k – 50k | Bigger VPS or Fly.io autoscale. SQLite still sufficient.                                                                                                       |
| Real scale | 50k – 1M | SQLite → PostgreSQL (Drizzle config swap). Add Redis (sessions + Socket.io adapter). Multiple servers behind load balancer. ~1-2 weeks of infrastructure work. |

### Architecture Reference — Lichess

Lichess (open source, AGPL-3.0) is the primary architecture reference. We study patterns; we write our own code.

| Pattern                 | Lichess source       | What we learn                                                                 |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Challenge / invite flow | `modules/challenge/` | Game creation, link sharing, opponent joining                                 |
| Game state machine      | `modules/game/`      | Status transitions: created → started → checkmate / resigned / draw / aborted |
| Clock synchronization   | `modules/round/`     | Lag compensation, server-authoritative time tracking                          |
| WebSocket protocol      | `modules/socket/`    | Event design, reconnection, sequence numbering                                |
| Board API               | lichess.org/api docs | Clean REST contract for game operations                                       |

**License boundary:** Chessground and pgn-viewer are MIT (free to use). All other lichess code is AGPL-3.0 — study only, no copying.

---

## AI Delivery Model

### Team

| Role                     | Model             | Scope                                                            |
| ------------------------ | ----------------- | ---------------------------------------------------------------- |
| Planner + Reviewer       | Claude Opus 4.6   | Writes plans, reviews implementations, breaks phases into tasks  |
| Challenger + Implementer | ChatGPT Codex 5.3 | Challenges plans from implementer perspective, writes code       |
| Human                    | Project owner     | Approves locked plans, unblocks stuck tasks, final sanity checks |

Sonnet 4.5 is available as an internal subtask tool within Opus workflows (fast searches, boilerplate checks). It is not a separate pipeline actor.

### Pipeline Hierarchy

```
Project Pipeline          ← walks milestones in order (no AI, pure orchestration)
  └── Milestone Pipeline  ← walks phases in order (no AI, pure orchestration)
       └── Phase Pipeline ← Opus breaks phase into tasks, orders by dependency
            └── Task Pipeline ← Opus plans/reviews, Codex challenges/implements
```

### Task Pipeline Flow

```
PLANNING PHASE (iterate, then lock)
  1. Opus drafts plan
  2. Codex challenges plan (implementer perspective)
  3. Opus refines based on feedback
  4. Repeat up to N iterations
  5. If converged or limit reached → plan locked
  6. AUTO-PROCEED on happy path; BLOCK if iteration limit hit without approval

IMPLEMENTATION PHASE (iterate until approved)
  1. Codex implements against locked plan
  2. Opus reviews (reads files, runs tests)
  3. If approved → task complete, auto-proceed to next task
  4. If rejected → back to Codex with feedback
  5. BLOCK if iteration limit hit without approval
```

### Pipeline Principles

- **File-based handoffs.** Prompts contain instructions + file paths only. Models read content from disk. No inline content in prompts.
- **Structured decisions.** Approval/rejection uses JSON schema output, not string matching.
- **Checkpointing.** `.pipeline/state.json` tracks progress. Resume = read state, find first in-progress item, continue.
- **Programmatic logging.** Orchestrator writes timestamped logs to `.pipeline/run.log`. No AI model reads or writes logs (zero token cost).
- **Auto-proceed on success.** Approved tasks, phases, and milestones flow into the next automatically.
- **Block on limits.** When iteration count is exhausted without approval, pipeline saves state and exits. Human reviews, then restarts.

### State Machine

All pipeline state lives in `.pipeline/state.json`:

```json
{
  "project": "chess-platform",
  "currentMilestone": "m1",
  "milestones": {
    "m0": { "status": "completed" },
    "m1": {
      "status": "in_progress",
      "currentPhase": "p1.2",
      "phases": {
        "p1.1": { "status": "completed" },
        "p1.2": {
          "status": "in_progress",
          "currentTask": "t2",
          "tasks": {
            "t1": { "status": "completed" },
            "t2": { "status": "in_progress", "iteration": 1 },
            "t3": { "status": "pending" }
          }
        }
      }
    }
  }
}
```

### Artifact Directory

```
.pipeline/
├── state.json
├── run.log
└── milestones/
    └── m1/
        ├── spec.md
        └── phases/
            └── p1.2/
                ├── spec.md
                └── tasks/
                    └── t2/
                        ├── spec.md
                        ├── plan-v1.md
                        ├── feedback-v1.md
                        ├── plan-locked.md
                        ├── impl-notes-v1.md
                        └── review-v1.md
```

---

## Milestones

### M0: Pipeline & Foundations

**Goal:** Establish the development infrastructure so all subsequent work flows through the automated pipeline.

#### Phase 0.1 — Pipeline v2

Rebuild the orchestrator with the full hierarchy, checkpointing, structured output, stdin-based prompting, and context reduction.

Exit criteria:

- Pipeline can walk a milestone → phase → task hierarchy from state.json.
- Tasks auto-proceed on approval, block on iteration limits.
- All prompts use file references, not inline content.
- Decision steps use structured JSON output.
- State is checkpointed after every step; pipeline can resume from any point.

#### Phase 0.2 — Repo Scaffold

Set up the pnpm monorepo structure with shared types.

Target structure:

```
chess/
├── apps/
│   ├── api/          # Fastify backend
│   └── web/          # Vite + React frontend
├── packages/
│   └── shared/       # TypeScript types, constants, chess utilities
├── pipeline/         # Orchestrator (already exists)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .github/workflows/ci.yml
```

Exit criteria:

- `pnpm install` works from root.
- `pnpm -r build` compiles all packages.
- `pnpm -r test` runs all tests.
- Shared types are importable from both apps/api and apps/web.
- CI runs lint + typecheck + test on every push.

#### Phase 0.3 — Backend & Frontend Skeletons

Minimal running applications with health checks.

Exit criteria:

- `apps/api`: Fastify server starts, `GET /health` returns `{ status: "ok" }`. SQLite database connects via Drizzle. Vitest configured.
- `apps/web`: Vite dev server starts, renders a page with Chessground board (static position, no game logic). Vitest configured.
- Both apps import from `packages/shared`.

---

### M1: Auth & Game Engine

**Goal:** Users can register, login, and play a turn-based chess game via HTTP API (no real-time yet).

#### Phase 1.1 — Authentication

Implement register, login, logout, and session management.

Exit criteria:

- `POST /auth/register` creates user with hashed password.
- `POST /auth/login` sets session cookie.
- `POST /auth/logout` destroys session.
- Protected endpoints reject unauthenticated requests with 401.
- Frontend has login/register pages that work end-to-end.

#### Phase 1.2 — Game Engine

Server-authoritative chess game creation and move validation.

Exit criteria:

- `POST /games` creates a new game, returns game ID and invite token.
- `POST /games/:id/join` lets the invited player claim the second seat (via invite token).
- `POST /games/:id/moves` validates and applies a move. Rejects illegal moves with deterministic error.
- `GET /games/:id` returns full game state (FEN, move history in PGN, clock state, game status).
- Game status transitions: `waiting` → `active` → `checkmate | stalemate | resigned | draw | timeout`.
- All moves validated server-side via chess.js. No illegal move can mutate state.

#### Phase 1.3 — Game Persistence

Store games and moves durably.

Exit criteria:

- Drizzle schema: `users`, `games`, `moves` tables.
- Games persist across server restarts.
- Move history is recoverable as PGN.
- `GET /api/games` returns the authenticated user's game list.

---

### M2: Live Play & Invite

**Goal:** Two users can play a live game in real time through a shareable invite link.

#### Phase 2.1 — WebSocket Gateway

Authenticated WebSocket connections with game rooms.

Exit criteria:

- Socket.io server attached to Fastify.
- Connections authenticated via session cookie.
- Players join a room scoped to their game ID.
- Server pushes events: `move`, `clock`, `gameOver`, `opponentJoined`, `opponentDisconnected`.
- Client sends events: `move`, `resign`, `offerDraw`, `acceptDraw`.
- Events use a versioned schema documented in `packages/shared`.

#### Phase 2.2 — Real-Time Gameplay

Live board with Chessground, synchronized clocks, game-over detection.

Exit criteria:

- Frontend renders Chessground board connected to game state via Socket.io.
- Moves are optimistic on client, confirmed/rejected by server.
- Clock counts down for active player, pauses for opponent. Server is authoritative on time.
- Game ends on checkmate, stalemate, timeout, resignation, or agreed draw.
- End-of-game screen shows result and basic move list.

#### Phase 2.3 — Invite Flow

Complete user journey from game creation to gameplay.

Exit criteria:

- User creates game → gets a shareable URL (e.g., `/join/<invite-token>`).
- Opponent opens URL → prompted to login/register if needed → joins game.
- Both players see the board update in real time once both are connected.
- Edge cases handled: invite link reused after game starts, creator cancels before opponent joins, opponent navigates away.

---

### M3: Polish & Launch

**Goal:** Ship a reliable MVP to friends and family.

#### Phase 3.1 — Reconnection & Resilience

Handle real-world network conditions.

Exit criteria:

- Player can close browser, reopen, and resume the game with correct board + clock state.
- Socket.io reconnection restores room membership and replays missed events.
- Duplicate move submissions after reconnect are rejected idempotently.
- UI shows connection status indicator (connected / reconnecting / disconnected).

#### Phase 3.2 — Testing & QA

Validate critical user flows.

Exit criteria:

- E2E test suite covers: register → login → create game → share link → join → play to checkmate.
- Tests run in CI.
- Tested on Chrome, Firefox, Safari (desktop) and Chrome, Safari (mobile).
- No critical bugs in the happy path.

#### Phase 3.3 — Deploy & Launch

Put the MVP live.

Exit criteria:

- Application deployed to a single VPS (Fly.io or Hetzner).
- HTTPS with valid certificate.
- Domain configured.
- SQLite database backed up on schedule (cron + copy to object storage).
- Basic health monitoring (uptime check, error alerting).
- 5 friends/family members have successfully played a game.

---

## Cross-Milestone Standards

- All game-mutating actions are server-authoritative. The client never decides game state.
- API endpoints validate input via Fastify schemas. Frontend validates for UX only.
- Every phase includes tests. No phase exits without passing tests in CI.
- Documentation updates ship in the same task as behavior changes.
- AI-generated code is always reviewed (by Opus or human) before merge.
- No secrets in code. Environment variables for all configuration.

## Immediate Next Step

Rebuild the pipeline (Phase 0.1) to support the hierarchical milestone → phase → task execution model. Then run Phase 0.2 and 0.3 through it.
