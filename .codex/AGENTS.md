# Chess Platform — Codex Instructions

## Overview

Online chess platform MVP: two authenticated users play a live game via a shareable invite link. Server-authoritative rules, real-time moves, chess clocks, reconnection support.

See `MASTER_PLAN.md` for full architecture, milestones, and non-goals.

## Monorepo Structure

```
chess/
├── apps/api/          # Fastify backend (@chess/api)
├── apps/web/          # Vite + React frontend (@chess/web)
├── packages/shared/   # Shared TypeScript types (@chess/shared)
├── pipeline/          # AI orchestration pipeline (do not modify)
├── .pipeline/         # Pipeline runtime state (do not modify)
└── MASTER_PLAN.md     # Architecture and milestone definitions
```

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, ESNext modules)
- **Backend**: Fastify 5, Drizzle ORM, better-sqlite3 (SQLite)
- **Frontend**: Vite 6, React 19, Chessground (lichess board UI)
- **Chess logic**: chess.js — used on both client (optimistic) and server (authoritative)
- **Realtime**: Socket.io
- **Auth**: Session cookies + bcrypt
- **Package manager**: pnpm 9 (workspaces)
- **Test runner**: Vitest

## Key Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages
pnpm test                 # Run all tests
pnpm typecheck            # TypeScript type checking
pnpm lint                 # ESLint
pnpm format:check         # Prettier check
pnpm format               # Prettier auto-fix
```

Per-package commands:
```bash
pnpm --filter @chess/api test     # Run API tests only
pnpm --filter @chess/web test     # Run web tests only
pnpm --filter @chess/api dev      # Start API dev server (tsx watch)
pnpm --filter @chess/web dev      # Start Vite dev server
```

## Coding Conventions — FOLLOW EXACTLY

- **ESM only**: Every package has `"type": "module"`. Use `.js` extensions in TypeScript imports.
  ```typescript
  // CORRECT
  import { db } from "./db/index.js";
  // WRONG
  import { db } from "./db/index";
  ```
- **Strict TypeScript**: No `any`. Use `interface` for object shapes, `type` for unions.
- **Prettier rules**: Double quotes, semicolons, trailing commas, 100 char width, 2-space indent.
- **Named exports only**: No `export default`.
- **Unused variables**: Prefix with `_` (e.g., `_req`).
- **Test files**: Located in `test/` directory per package. Named `*.test.ts`.

## Fastify Patterns

Use the `buildApp()` factory pattern. Type route generics:
```typescript
import Fastify from "fastify";
import type { HealthResponse } from "@chess/shared";

export function buildApp() {
  const app = Fastify({ logger: false });
  app.get<{ Reply: HealthResponse }>("/health", async (_req, reply) => {
    return reply.send({ status: "ok" });
  });
  return app;
}
```

## Drizzle ORM Patterns

Schema lives in `apps/api/src/db/schema.ts`:
```typescript
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});
```

Database instance: `apps/api/src/db/index.ts`. Database file: `apps/api/data/chess.db`.

## Shared Types

All types shared between frontend and backend live in `packages/shared/src/index.ts`. Import as:
```typescript
import type { HealthResponse } from "@chess/shared";
```

Build shared package before api/web: `pnpm --filter @chess/shared build`.

## Architecture Rules

- **Server-authoritative**: All game state mutations validated on the server. Client displays only.
- **No premature abstractions**: Build exactly what the spec asks. No extra features.
- **No secrets in code**: Environment variables only.
- **Validation**: Fastify schemas for API input. Frontend validates for UX only.

## After Every Implementation

Always run these verification commands before finishing:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

All four must pass. Fix any failures before declaring implementation complete.
