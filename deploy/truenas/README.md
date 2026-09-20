# TrueNAS SCALE Custom App

This template targets the Docker Apps platform in TrueNAS SCALE 24.10 and newer. The Custom App mechanism was exercised on TrueNAS 25.10.7 (amd64); verify this production stack's dataset permissions and download recovery on the target system.

## Prepare datasets and images

Create two datasets in the TrueNAS UI:

- An app config dataset mounted at `/mnt/<pool>/apps/aria-station/aria2-config`
- A download dataset mounted at `/mnt/<pool>/downloads` (or choose another existing dataset and update the YAML)

Set the config and download dataset ACLs to allow read/write for UID 568 and GID 568 (`apps`). Do not recursively change permissions on a dataset containing existing files unless intended. Aria2 exits with a clear message if it cannot write either mount.

Publish versioned images by pushing a version tag such as `v0.1.0`. The GitHub Actions workflow builds `linux/amd64` and `linux/arm64` images and publishes `ghcr.io/tranch/aria-station:0.1.0` and `ghcr.io/tranch/aria-station-aria2:0.1.0`. Make both GHCR packages public, or configure registry access on TrueNAS before installation.

## Install

1. Open Apps → Discover Apps → Install via YAML (Custom App).
2. Paste `aria-station.yaml`.
3. Replace `/mnt/POOL/...` with the exact absolute paths of the datasets created above.
4. Replace the 64-character RPC secret placeholder with `openssl rand -hex 32`. Use the same value in both services.
5. Replace the web password placeholder with a unique password of at least 16 characters. Store the completed YAML securely because it contains both credentials.
6. Change the published web port if `55290` is already in use, then install the app.
7. Open `http://<nas-address>:55290/`. The browser asks for the configured username and password.

The web container runs as UID/GID 1000 and has read-only root storage. The aria2 container runs as UID/GID 568, writes the session under `/config`, and writes downloads under `/downloads`. RPC port 6800 is not published to the host. TCP and UDP port 51413 are published for BitTorrent; router and firewall forwarding are a separate network configuration step.

HTTP Basic credentials are encoded but not encrypted over plain HTTP. Use the TrueNAS reverse proxy with HTTPS or restrict access to a trusted LAN/VPN. The app does not provide user accounts, password reset, or per-user permissions.

## Verify and recover

The app's state should be RUNNING and the web container should become healthy. Open Settings in Aria Station and confirm that aria2 is connected. Add a small test download, verify it appears in the download dataset, restart the app, and confirm the task resumes.

Before upgrades, snapshot both datasets. The aria2 config dataset contains the session file used to resume unfinished work; the download dataset contains payloads and aria2 control files. Restore both datasets together, then start the app. There is no separate application-history database yet.

The web health check tests process readiness only. An unavailable aria2 engine is reported in the UI and does not trigger a web-container restart loop.

## Upgrade

Before installing a new version, snapshot both datasets. Update both image tags in the YAML to the same published version and apply the Custom App update. Keep the prior YAML and image tags to roll back. This project currently has no database migrations; that may change when persistent application history is added.
