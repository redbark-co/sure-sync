# Redbark Sure Sync

Automatically sync bank transactions from [Redbark](https://redbark.co) to your self-hosted [Sure](https://github.com/we-promise/sure) instance.

Ships as a single Docker image. Pull, configure, schedule, done.

## How It Works

1. Fetches transactions from your Redbark account via API key
2. Maps them to your Sure accounts
3. Creates transactions in Sure via REST API with deduplication
4. Safe to run repeatedly — duplicate transactions are never created

Supports all Redbark banking providers: Fiskil (AU), Akahu (NZ), SnapTrade (global).

## Quick Start

### 1. Get a Redbark API Key

1. Log into [Redbark](https://app.redbark.co)
2. Go to **Settings > API Keys**
3. Create a key and copy it (shown once)

### 2. Get a Sure API Key

1. Log into your Sure instance
2. Go to **Settings > Security > API Keys**
3. Create an API key with `read_write` scope
4. Copy the key

### 3. Find Your Account IDs

```bash
# List your Redbark accounts
docker run --rm \
  -e REDBARK_API_KEY=rbk_live_... \
  ghcr.io/redbark-co/sure-sync:latest \
  --list-redbark-accounts

# List your Sure accounts
docker run --rm \
  -e SURE_URL=http://localhost:3000 \
  -e SURE_API_KEY=your-sure-api-key \
  ghcr.io/redbark-co/sure-sync:latest \
  --list-sure-accounts
```

### 4. Create a `.env` File

```bash
REDBARK_API_KEY=rbk_live_a1b2c3d4e5f6...
SURE_URL=http://localhost:3000
SURE_API_KEY=your-sure-api-key
ACCOUNT_MAPPING=acc_abc123:d5e6f7g8-1234-5678-abcd-ef1234567890,acc_def456:a1b2c3d4-5678-9012-cdef-345678901234
TAG_NAME=Redbark
```

### 5. Run

```bash
# Preview first (no changes written)
docker run --rm --env-file .env ghcr.io/redbark-co/sure-sync:latest --dry-run

# Run for real
docker run --rm --env-file .env ghcr.io/redbark-co/sure-sync:latest
```

### 6. Schedule

```bash
# Cron: sync every 6 hours
0 */6 * * * docker run --rm --env-file /home/user/.redbark-sure-sync.env ghcr.io/redbark-co/sure-sync:latest >> /var/log/redbark-sure-sync.log 2>&1
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDBARK_API_KEY` | Yes | — | Your Redbark API key (`rbk_live_...`) |
| `SURE_URL` | Yes | — | URL of your Sure instance |
| `SURE_API_KEY` | Yes | — | Sure API key (`read_write` scope) |
| `ACCOUNT_MAPPING` | Yes | — | Account mapping (see below) |
| `REDBARK_API_URL` | No | `https://api.redbark.co` | Redbark API base URL |
| `SYNC_DAYS` | No | `30` | Number of days of history to sync |
| `CATEGORY_MAPPING` | No | — | Category mapping (see below) |
| `TAG_NAME` | No | — | Tag name to apply to synced transactions |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |
| `DRY_RUN` | No | `false` | Set to `true` to preview without creating |
| `BATCH_SIZE` | No | `25` | Transactions per batch (max 100) |
| `CURRENCY` | No | — | Override currency for all transactions (e.g. `AUD`) |

### Account Mapping

Maps Redbark account IDs to Sure account IDs (UUIDs), comma-separated:

```
ACCOUNT_MAPPING=<redbark_id>:<sure_id>,<redbark_id>:<sure_id>
```

**Finding IDs:**
- **Redbark**: Run `--list-redbark-accounts` or check the Redbark dashboard
- **Sure**: Run `--list-sure-accounts` or check the account URL in Sure's web UI

### Category Mapping (Optional)

Map Redbark categories to Sure category UUIDs:

```
CATEGORY_MAPPING=groceries:uuid1,transport:uuid2,dining:uuid3
```

Run `--list-sure-categories` to find your Sure category IDs.

### CLI Flags

| Flag | Description |
|------|-------------|
| `--list-redbark-accounts` | List Redbark accounts and their IDs |
| `--list-sure-accounts` | List Sure accounts and their IDs |
| `--list-sure-categories` | List Sure categories and their IDs |
| `--dry-run` | Preview what would be created without writing |
| `--days <n>` | Override number of days to sync |
| `--help` | Show help message |

## Docker

### Docker Run

```bash
docker run --rm \
  --env-file .env \
  ghcr.io/redbark-co/sure-sync:latest
```

No volume is needed — Sure sync is stateless (no local cache).

### Docker Compose

See [`docker-compose.example.yml`](docker-compose.example.yml) for a ready-to-use setup that includes both this tool and a Sure instance with Postgres and Redis.

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: redbark-sure-sync
spec:
  schedule: "0 */6 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: sync
              image: ghcr.io/redbark-co/sure-sync:latest
              envFrom:
                - secretRef:
                    name: redbark-sure-sync-secrets
```

## How Deduplication Works

Each synced transaction is tagged with a machine-readable marker in the notes field:

```
[redbark:txn_abc123] | Category: groceries | MCC: 5411
```

On subsequent runs, the tool checks for duplicates using two methods:

1. **Exact match**: Searches existing Sure transactions for `[redbark:<id>]` in the notes field
2. **Fingerprint match**: Compares date + amount + name to catch manually imported transactions

This dual-layer approach means you can safely run the sync as often as you want.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Sync completed successfully |
| 1 | Sync completed with errors (some transactions failed) |
| 2 | Configuration error (missing env vars, invalid mapping) |
| 3 | Connection error (cannot reach Redbark or Sure) |

## Security

- **API keys**: Your Redbark key is only sent over HTTPS. Your Sure key is sent to your own infrastructure. Never bake secrets into Docker images.
- **Stateless**: No local data storage. Transaction data exists only in memory during the run.
- **Secrets**: Use `--env-file` or orchestrator secrets (Kubernetes Secrets, Docker Secrets). Avoid `-e` flags which may persist in shell history.

## Development

```bash
# Install dependencies
pnpm install

# Run locally
pnpm dev -- --dry-run

# Type check
pnpm lint

# Run tests
pnpm test

# Build
pnpm build
```

## License

MIT
