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

Authentication, persistent application history, production Docker images, and the full TrueNAS delivery workflow remain planned work.

## Project structure

```text
.
├── apps/
│   ├── web/                 React + TypeScript + Vite frontend
│   └── server/              Fastify service and aria2 JSON-RPC adapter
├── deploy/docker/           Development container configuration
├── docs/                    Implementation plan and delivery notes
├── compose.yaml             UI development preview
├── package.json             Workspace scripts and dependencies
└── run-aria2.sh             Local aria2 helper script
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

Set `ARIA2_RPC_URL` and `ARIA2_RPC_SECRET` in `.env`. The secret must match the secret used by aria2. For a local aria2 instance, the included helper can be used:

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

## Docker and TrueNAS direction

The intended production layout separates the web service and aria2 into two containers. The web service is exposed to users, while aria2 RPC remains on a private container network. Users may also run Aria Station as a web service connected to an existing aria2 instance.

TrueNAS support targets SCALE 24.10+ Docker Apps using Custom App YAML. The release workflow still needs real-device validation for dataset permissions, UID/GID mapping, health checks, session recovery, backups, upgrades, and rollback. The current Compose file is a UI development preview and is not a production or TrueNAS deployment.

## License

An open-source license and third-party license inventory will be added before the first public release.
