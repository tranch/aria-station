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

Authentication is configurable for single-admin deployments. Application task history is not yet stored independently; aria2's active and queued tasks persist in its session file.

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

The example also enables HTTP Basic authentication locally: use the configured `AUTH_USER` and `AUTH_PASSWORD` when the browser prompts. Replace the example password before exposing the service beyond your own machine.

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

The production stack runs Aria Station and aria2 in separate containers. Only the web interface and aria2's BitTorrent listening port are published; RPC stays on the private container network. Configure `AUTH_USER` and a unique `AUTH_PASSWORD` of at least 16 characters. The browser will prompt for these credentials. Basic authentication should be used over HTTPS or on a trusted, firewalled LAN.

For a Docker host, copy `.env.example` to `.env`, replace both placeholder secrets, set writable data paths, then run:

```bash
docker compose up -d --build
```

Generate secrets with `openssl rand -hex 32`; use a different value for the web password and aria2 RPC secret. Downloaded files are stored under `DOWNLOADS_PATH`, and aria2's resume session is stored under `ARIA2_CONFIG_PATH`. These paths must be writable by `PUID:PGID` (default `568:568`). The web process runs as the unprivileged `node` user.

On a Linux host, create new empty bind-mount directories and grant the aria2 identity access before the first start:

```bash
mkdir -p .data/aria2-config .data/downloads
sudo chown 568:568 .data/aria2-config .data/downloads
```

Do not apply that ownership change recursively to existing download data unless that is intended.

TrueNAS SCALE 24.10+ can install [`deploy/truenas/aria-station.yaml`](deploy/truenas/aria-station.yaml) using Apps → Discover Apps → Install via YAML (Custom App). Replace the template dataset paths, set ACL access for UID/GID 568, and replace both secret placeholders. Versioned images are published to GHCR when a `v*` Git tag is pushed; the packages must be public or otherwise accessible to the NAS before installation. See [`deploy/truenas/README.md`](deploy/truenas/README.md) for setup, backup, and upgrade instructions.

The app is not yet a catalog release. The `/api/ready` health check indicates that the web process is alive; the app's Settings page separately reports aria2 connectivity. Application history and automatic database backups are not implemented yet.

## License

An open-source license and third-party license inventory will be added before the first public release.
