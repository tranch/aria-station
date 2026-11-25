# Aria Station

Aria Station is a modern aria2 dashboard inspired by Synology Download Station's layout design. It was created to provide a cleaner, more focused web interface for aria2 users who want a self-hosted download workspace suitable for home servers and NAS devices.

The project borrows the high-level information architecture—category navigation, an action toolbar, a task table, and a details panel—but uses its own visual language, icons, and interaction design. Aria Station is not affiliated with Synology and does not reproduce Synology trademarks, assets, or source code.

## Current status

The current milestone provides a working React frontend and same-origin Node.js service that communicates with aria2 through JSON-RPC. It supports:

- Downloading HTTP, HTTPS, FTP, and Magnet links
- Adding torrent files
- Browsing active, queued, paused, completed, failed, removed, and seeding tasks
- Searching, sorting, selecting, pausing, resuming, and removing tasks
- Viewing task files and BitTorrent peers on demand
- Selecting torrent files and setting a task download limit
- Live refresh, connection diagnostics, and aria2 WebSocket notifications
- Persistent task tags and path metadata for external integrations

First launch creates a local administrator account. Passwords are stored as Argon2id hashes, authenticated sessions use HttpOnly cookies, and observed task history is stored in SQLite independently of aria2.

## Project structure

```text
.
├── apps/
│   ├── web/                 React + TypeScript + Vite frontend
│   └── server/              Fastify service and aria2 JSON-RPC adapter
├── deploy/docker/           Production and development container images
├── deploy/truenas/          TrueNAS Custom App YAML template
├── docs/                    Implementation plan and delivery notes
├── compose.yaml             Production two-container stack
├── package.json             Workspace scripts and dependencies
└── .github/workflows/       Multi-architecture image publishing
```

The browser only talks to the web service. The service owns the aria2 RPC secret and exposes a controlled API to the frontend.

Aria Station persists task metadata independently of aria2 so tags and path mappings survive service restarts. External download managers can use the authenticated API documented in [the task metadata contract](docs/task-metadata-api.md). MoviePilot is one possible client; Aria Station's own downloads remain usable without an integration client. The API token is separate from the aria2 RPC secret.

## Requirements

- Node.js 22.12 or newer
- npm
- aria2 with JSON-RPC enabled for a complete local integration test

## Run locally

Install dependencies and start the frontend and service in separate terminals:

```bash
npm install
npm run dev:server
npm run dev
```

Open <http://localhost:5173>. The Vite development server proxies `/api` requests to the service on port `55290`.

Create a local environment file before starting the service:

```bash
cp .env.example .env
```

Set `ARIA2_RPC_URL` and `ARIA2_RPC_SECRET` in `.env`. The secret must match the secret used by aria2. A local aria2 instance can be started with the helper script:

On first launch, open the app and create the administrator account. Local development uses a non-secure cookie; production defaults to secure cookies and should be served over HTTPS.

```bash
./run-aria2.sh
```

Alternatively, start aria2 manually with RPC enabled and restricted to localhost:

```bash
aria2c \
  --enable-rpc=true \
  --rpc-listen-port=6800 \
  --rpc-listen-all=false \
  --rpc-secret="$ARIA2_RPC_SECRET"
```

Useful checks:

```bash
npm run typecheck
npm run build
```

## Docker and TrueNAS

The production stack runs Aria Station and aria2 in separate containers. Only the web interface and aria2's BitTorrent listening port are published; RPC stays on the private container network. Create the administrator on first launch. Set `COOKIE_SECURE=false` only for local HTTP testing; production should use HTTPS. The SQLite database is stored in `APP_DATA_PATH`, which must be writable by the web container UID.

For a Docker host, copy `.env.example` to `.env`, replace both placeholder secrets, set writable data paths, then run:

```bash
docker compose up -d --build
```

Generate the RPC secret with `openssl rand -hex 32`. Downloaded files are stored under `DOWNLOADS_PATH`, and aria2's resume session is stored under `ARIA2_CONFIG_PATH`. These paths must be writable by `PUID:PGID` (default `568:568`). The web process runs as the unprivileged `node` user.

On a Linux host, create new empty bind-mount directories and grant the aria2 identity access before the first start:

```bash
mkdir -p .data/aria2-config .data/downloads
sudo chown 568:568 .data/aria2-config .data/downloads
```

Do not apply that ownership change recursively to existing download data unless that is intended.

TrueNAS SCALE 24.10+ can install [`deploy/truenas/aria-station.yaml`](deploy/truenas/aria-station.yaml) using Apps → Discover Apps → Install via YAML (Custom App). Replace the template dataset paths, set ACL access for UID/GID 568, and replace both secret placeholders. Versioned images are published to GHCR when a `v*` Git tag is pushed; the packages must be public or otherwise accessible to the NAS before installation. See [`deploy/truenas/README.md`](deploy/truenas/README.md) for local development, release, installation, upgrade, verification, and rollback instructions.

The app is not yet a catalog release. The `/api/ready` health check indicates that the web process is alive; the app's Settings page separately reports aria2 connectivity. Back up the SQLite file in `APP_DATA_PATH` together with the aria2 config/session data. Aria2 saves its session periodically and receives an explicit save request on graceful shutdown; abrupt power loss can still lose changes since the last save.

## License

An open-source license and third-party license inventory will be added before the first public release.
