# Chess Platform — Project Instructions

## Overview

Online chess platform MVP: two authenticated users play a live game via a shareable invite link. Server-authoritative rules, real-time moves, chess clocks, reconnection support.

See `MASTER_PLAN.md` for full architecture, milestones, and non-goals.

## Monorepo Structure

```
chess/
├── apps/api/          # Fastify backend (@chess/api)
├── apps/web/          # Vite + React frontend (@chess/web)
├── packages/shared/   # Shared TypeScript types (@chess/shared)
├── pipeline/          # AI orchestration pipeline
├── .pipeline/         # Pipeline runtime state and artifacts (gitignored)
└── MASTER_PLAN.md     # Architecture and milestone definitions
```

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, ESNext modules)
- **Backend**: Fastify 5, Drizzle ORM, better-sqlite3
- **Frontend**: Vite 6, React 19, Chessground (lichess board UI)
- **Chess logic**: chess.js (both client and server)
- **Realtime**: Socket.io
- **Auth**: Session cookies + bcrypt
- **Package manager**: pnpm 9 (workspaces)
- **Test runner**: Vitest
- **CI**: GitHub Actions

## Key Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (pnpm -r build)
pnpm test                 # Run all tests (pnpm -r test)
pnpm typecheck            # TypeScript checking across all packages
pnpm lint                 # ESLint
pnpm format:check         # Prettier check
pnpm format               # Prettier write
```

## Coding Conventions

- **Module system**: ESM only (`"type": "module"` in all package.json files). Use `.js` extensions in TypeScript imports (e.g., `import { db } from "./db/index.js"`).
- **TypeScript**: Strict mode. No `any` unless unavoidable. Use `interface` for object shapes, `type` for unions/intersections.
- **Formatting**: Prettier — double quotes, semicolons, trailing commas, 100 char width, 2-space indent.
- **Linting**: ESLint with typescript-eslint. Unused vars must be prefixed with `_`.
- **No default exports**. Use named exports everywhere.
- **Fastify patterns**: Use `buildApp()` factory pattern (see `apps/api/src/server.ts`). Type route generics (`app.get<{ Reply: Type }>`).
- **Drizzle patterns**: Schema in `apps/api/src/db/schema.ts`. Use `integer` timestamps with `unixepoch()` default.
- **Shared types**: All types shared between frontend and backend go in `packages/shared/src/index.ts`. Import as `@chess/shared`.
- **Tests**: Colocate in `test/` directories within each package. Name pattern: `*.test.ts`.

## Architecture Rules

- **Server-authoritative**: All game-mutating actions validated on the server. Client is for display only.
- **No premature abstractions**: Implement exactly what the spec asks. No extra features, no future-proofing.
- **No secrets in code**: Use environment variables for all configuration.
- **Input validation**: Fastify schemas for API validation. Frontend validates for UX only.
- **Security**: Follow OWASP top 10. No hardcoded secrets, no command injection, no SQL injection, no XSS.

## Database

- **Engine**: SQLite via better-sqlite3 (dev + MVP)
- **ORM**: Drizzle ORM with `drizzle-orm/sqlite-core`
- **Location**: `apps/api/data/chess.db`
- **Config**: `apps/api/src/db/drizzle.config.ts`

## Pipeline

The AI delivery pipeline is in `pipeline/`. It orchestrates Opus (planning/review) and Codex (challenge/implement). See `MASTER_PLAN.md` section "AI Delivery Model" for the full workflow.

**Role boundary:** Claude Code (Opus) is for **discussion, design, and authoring pipeline specs**. All code implementation flows through the pipeline — Opus plans/reviews, Codex challenges/implements. Never implement features directly in a Claude Code session.

**Architecture overview:**

- Hierarchy: Project → Milestone → Phase → Task
- Task lifecycle: `pending` → `planning` (Opus drafts plan, Codex challenges) → `plan_locked` → `implementing` (Codex implements, Opus reviews) → `completed` or `blocked`
- Phase completion creates a git branch + PR for human review/merge

**Pipeline commands** (run from `pipeline/`):

```bash
npm run pipeline -- init [--force]    # Scan .pipeline/ and create state.json
npm run pipeline -- run [--dry-run]   # Execute next pending task
npm run pipeline -- unblock <m> <p> <t> <planning|implementing>
```

**Starting a new phase — checklist:**

1. Create phase directory: `.pipeline/milestones/{m}/phases/{p}/`
2. Write `spec.md` (sections: Goal, Architectural Decisions, Exit Criteria, Tasks, Dependencies, Relevant Files)
3. Create task directories: `.pipeline/milestones/{m}/phases/{p}/tasks/{t}/`
4. Write `spec.md` per task (sections: Goal, Deliverables, Verification, Depends On)
5. Update `.pipeline/state.json` — add phase + tasks with `pending` status
6. Run `npm run pipeline -- run`

**Artifact conventions:**

- Phase spec: `.pipeline/milestones/{m}/phases/{p}/spec.md`
- Task spec: `.pipeline/milestones/{m}/phases/{p}/tasks/{t}/spec.md`
- Plan iterations: `plan-v{n}.md`, `feedback-v{n}.md`, `plan-locked.md`
- Implementation: `impl-notes-v{n}.md`, `review-v{n}.md`

**Rules:**

- Do not modify files in `.pipeline/` except when authoring specs and updating `state.json` for new phases.
- Do not implement code directly — that is the pipeline's job.
- The pipeline auto-commits per task and creates a PR per phase.
- Human merges the PR before the next phase can start.
