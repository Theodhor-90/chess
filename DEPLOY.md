# Deployment Guide — Chess Platform

Step-by-step runbook for deploying the chess platform to [Fly.io](https://fly.io).

## Prerequisites

1. **Install flyctl** (the Fly.io CLI):

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

   Verify: `fly version`

2. **Authenticate**:

   ```bash
   fly auth login
   ```

3. **Docker** must be installed and running locally (Fly.io builds the image using your local Docker or a remote builder).

## Initial Deployment

### 1. Create the Fly.io App

```bash
fly apps create chess-platform
```

Replace `chess-platform` with your desired app name. If you use a different name, update the `app` field in `fly.toml` to match.

### 2. Set Secrets

These are sensitive values that must NOT be in `fly.toml` or source control.

```bash
fly secrets set \
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  CORS_ORIGIN=https://chess-platform.fly.dev
```

Adjust `CORS_ORIGIN` to match your actual app URL (`https://<app-name>.fly.dev`).

### 3. Create Persistent Volume

The SQLite database is stored on a persistent volume that survives deploys and machine restarts.

```bash
fly volumes create chess_data --region iad --size 1
```

- `chess_data` matches the `source` in `fly.toml` `[mounts]` section.
- `--region iad` is US East (Virginia). Change to match your `primary_region` in `fly.toml`.
- `--size 1` creates a 1 GB volume. Sufficient for MVP (a chess database grows very slowly).

### 4. Deploy

```bash
fly deploy
```

This builds the Docker image and deploys it. The first deploy takes a few minutes to build native addons (`better-sqlite3`, `bcrypt`). Subsequent deploys are faster due to Docker layer caching.

### 5. Verify

```bash
# Check machine status
fly status

# Test health endpoint
curl https://chess-platform.fly.dev/health
# Expected: {"status":"ok"}

# Open in browser
fly apps open
```

The app should be accessible at `https://chess-platform.fly.dev`. The frontend should load, and you should be able to register, log in, and create games.

## Sharing with Friends

1. Register an account at `https://chess-platform.fly.dev`.
2. Log in and create a new game.
3. Copy the invite link and send it to a friend.
4. Your friend opens the link, registers/logs in, and joins the game.
5. Play!

## Database Backups

### Manual Backup

Run the backup script via SSH:

```bash
fly ssh console -C "/app/scripts/backup.sh"
```

This creates a timestamped backup at `/app/data/backups/chess-YYYYMMDD-HHMMSS.db` and retains the last 7 backups.

### List Existing Backups

```bash
fly ssh console -C "ls -lh /app/data/backups/"
```

### Scheduled Backups (Optional)

Use Fly.io's scheduled machine feature to run backups automatically:

```bash
fly machine run . \
  --schedule daily \
  --command "/app/scripts/backup.sh" \
  --region iad
```

Alternatively, use an external cron service (e.g., cron-job.org) to call a backup endpoint, or set up a cron job on a separate machine.

### Download a Backup

To download a backup to your local machine:

```bash
fly ssh sftp get /app/data/backups/chess-YYYYMMDD-HHMMSS.db ./local-backup.db
```

### Future Enhancement: Off-Site Backups

For production reliability beyond MVP, consider copying backups to object storage (e.g., Tigris on Fly.io, or AWS S3). This protects against volume loss. The backup script can be extended with `aws s3 cp` or similar after creating the local backup.

## Monitoring

### Logs

```bash
# Stream live logs
fly logs

# View recent logs
fly logs --no-tail
```

### Health Check

Fly.io automatically monitors the `/health` endpoint every 30 seconds (configured in `fly.toml`). If the health check fails, Fly.io will restart the machine.

### Machine Status

```bash
fly status
```

Shows machine state, region, health check results, and uptime.

## Subsequent Deploys

After code changes:

```bash
fly deploy
```

The persistent volume at `/app/data` is preserved across deploys. Your database is not affected.

It is recommended to run a backup before deploying:

```bash
fly ssh console -C "/app/scripts/backup.sh"
fly deploy
```

## Troubleshooting

### Volume Not Attached

**Symptom**: App crashes with `SQLITE_CANTOPEN` or "database not found" errors.

**Fix**: Verify the volume exists and is attached:

```bash
fly volumes list
```

If no volume exists, create one:

```bash
fly volumes create chess_data --region iad --size 1
```

Then redeploy: `fly deploy`.

### Missing Secrets

**Symptom**: App starts but cookies don't work, or you see "dev-fallback-secret-not-for-production" warnings.

**Fix**: Set the required secrets:

```bash
fly secrets list
fly secrets set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fly secrets set CORS_ORIGIN=https://your-app-name.fly.dev
```

### Native Module Failures

**Symptom**: App crashes with errors like "Cannot find module better-sqlite3" or "invalid ELF header".

**Cause**: Native addons were compiled for the wrong architecture (e.g., macOS instead of Linux).

**Fix**: Ensure the Docker build is not using cached layers from a different architecture:

```bash
fly deploy --no-cache
```

### WebSocket Connections Dropping

**Symptom**: Players lose connection during games, especially after idle periods.

**Cause**: `auto_stop_machines = "suspend"` in `fly.toml` suspends the machine after inactivity.

**Fix**: For active use, update `fly.toml`:

```toml
[http_service]
  auto_stop_machines = "off"
  min_machines_running = 1
```

Then redeploy: `fly deploy`.

### CORS Errors in Browser

**Symptom**: Browser console shows "CORS policy" errors.

**Fix**: Verify `CORS_ORIGIN` matches the actual URL:

```bash
fly secrets list
```

The `CORS_ORIGIN` value must be the exact origin including scheme (e.g., `https://chess-platform.fly.dev`), with no trailing slash.

### SSH Access

For direct access to the running container:

```bash
fly ssh console
```

From there you can inspect the database, check files, or run diagnostics:

```bash
ls -la /app/data/
sqlite3 /app/data/chess.db ".tables"
sqlite3 /app/data/chess.db "SELECT count(*) FROM users"
```

## Cost Estimate

With the default `fly.toml` configuration:

- **Machine**: `shared-cpu-1x` with 256 MB RAM (Fly.io default)
- **Volume**: 1 GB persistent storage
- **Estimated cost**: Free under Fly.io's [free allowances](https://fly.io/docs/about/pricing/) (3 shared-cpu-1x VMs, 3 GB persistent storage included)
- **Note**: The `auto_stop_machines = "suspend"` configuration suspends the machine when idle, which minimizes costs. If you change to `min_machines_running = 1` for active use, the machine runs 24/7 but is still within free tier limits for a single machine.

## Environment Variables Reference

See `.env.example` for the full list. Summary:

| Variable         | Required         | Default              | Description                                               |
| ---------------- | ---------------- | -------------------- | --------------------------------------------------------- |
| `SESSION_SECRET` | Yes (production) | dev fallback         | Cookie signing secret (min 32 chars)                      |
| `CORS_ORIGIN`    | Yes (production) | all origins          | Allowed CORS origin (e.g., `https://app.fly.dev`)         |
| `NODE_ENV`       | No               | unset                | Set to `production` for secure cookies and static serving |
| `PORT`           | No               | `3000`               | Server listen port                                        |
| `HOST`           | No               | `0.0.0.0`            | Server bind address                                       |
| `DATABASE_URL`   | No               | `/app/data/chess.db` | Path to SQLite database file                              |
