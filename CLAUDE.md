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

Do not modify files in `.pipeline/` manually — the pipeline manages its own state.
