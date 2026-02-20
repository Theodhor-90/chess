# Chess Platform

Online chess platform where two authenticated users can play a live game via a shareable invite link. Features server-authoritative rules, real-time moves, chess clocks, and reconnection support.

## Tech Stack

- **Backend**: Fastify 5, Drizzle ORM, better-sqlite3, Socket.io
- **Frontend**: Vite 6, React 19, Chessground (lichess board UI), Redux Toolkit
- **Chess logic**: chess.js (client + server)
- **Auth**: Session cookies + bcrypt
- **Language**: TypeScript (strict mode)
- **Monorepo**: pnpm workspaces

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+

## Getting Started

```bash
# Clone the repo
git clone https://github.com/Theodhor-90/chess.git
cd chess

# Install dependencies
pnpm install

# Start the API server (with hot reload)
pnpm --filter @chess/api dev

# Start the web app (in a separate terminal)
pnpm --filter @chess/web dev
```

## Project Structure

```
chess/
├── apps/
│   ├── api/             # Fastify backend (@chess/api)
│   └── web/             # Vite + React frontend (@chess/web)
├── packages/
│   └── shared/          # Shared TypeScript types (@chess/shared)
├── pipeline/            # AI orchestration pipeline
└── MASTER_PLAN.md       # Architecture and milestone definitions
```

## Scripts

Run these from the repo root:

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `pnpm install`       | Install all dependencies             |
| `pnpm build`         | Build all packages                   |
| `pnpm test`          | Run all tests (Vitest)               |
| `pnpm typecheck`     | TypeScript type checking             |
| `pnpm lint`          | Run ESLint                           |
| `pnpm format:check`  | Check formatting (Prettier)          |
| `pnpm format`        | Auto-format all files (Prettier)     |

## Development

### API Server

```bash
pnpm --filter @chess/api dev       # Start with hot reload
pnpm --filter @chess/api test      # Run API tests
pnpm --filter @chess/api build     # Compile TypeScript
```

### Web App

```bash
pnpm --filter @chess/web dev       # Start Vite dev server
pnpm --filter @chess/web test      # Run frontend tests
pnpm --filter @chess/web build     # Production build
```

### Database

The API uses SQLite stored at `apps/api/data/chess.db`. Drizzle ORM manages the schema. To generate or apply migrations:

```bash
cd apps/api
npx drizzle-kit generate
npx drizzle-kit migrate
```

## CI

GitHub Actions runs lint, typecheck, format check, and tests on every push and pull request to `main`.
