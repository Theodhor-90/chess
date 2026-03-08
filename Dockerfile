# ---- Build stage ----
FROM node:22-slim AS build

# Install build tools for native addons (better-sqlite3, bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy lockfile and workspace config first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files to leverage Docker layer caching
# (dependency install layer is cached until a package.json or lockfile changes)
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Copy workspace member package.json files for e2e and pipeline.
# These are not built or deployed, but pnpm-workspace.yaml declares them
# and pnpm install --frozen-lockfile requires all workspace members to exist.
COPY e2e/package.json e2e/package.json
COPY pipeline/package.json pipeline/package.json

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy full source
COPY tsconfig.base.json tsconfig.base.json
COPY apps/api/ apps/api/
COPY apps/web/ apps/web/
COPY packages/shared/ packages/shared/

# Build only deployable packages (exclude pipeline/e2e workspace members)
RUN pnpm -r --filter @chess/shared --filter @chess/api --filter @chess/web build

# ---- Production stage ----
FROM node:22-slim AS production

# Install sqlite3 CLI for backup script
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json files (needed for Node.js module resolution)
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json

# Copy node_modules from build stage (includes compiled native addons for Linux)
# Full node_modules is copied rather than pruning, for workspace compatibility.
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/apps/api/node_modules/ apps/api/node_modules/
COPY --from=build /app/packages/shared/node_modules/ packages/shared/node_modules/

# Copy compiled output from build stage
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/apps/api/dist/ apps/api/dist/
COPY --from=build /app/apps/web/dist/ apps/web/dist/

# Create data directory for SQLite (will be overridden by Fly.io volume mount)
RUN mkdir -p /app/data

# Copy backup script
COPY scripts/ scripts/
RUN chmod +x scripts/backup.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "apps/api/dist/index.js"]
