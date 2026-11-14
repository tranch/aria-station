# TrueNAS SCALE Custom App

This guide covers local development, first installation, upgrades, verification, and rollback for the Aria Station Custom App on TrueNAS SCALE 24.10+ using Docker Apps and Docker Compose YAML. Confirm image compatibility and storage behavior on the target TrueNAS release before relying on a deployment.

## Development and release workflow

Build and verify images on a development machine or in CI. Do not use the TrueNAS host as the application build environment. The repository's GitHub Actions workflow builds `linux/amd64` and `linux/arm64` images when a `v*` Git tag is pushed, then publishes versioned Web and aria2 images to GHCR.

For a release such as `v0.1.0`:

1. Set the root package, workspace package, lockfile, and this Compose template to the intended version. The Web and aria2 image tags should refer to published images; they may differ when the aria2 image has not changed, but each tag must exist.
2. Run the project's build, type checks, and release checks.
3. Push the version tag and confirm both image publishing jobs succeed.
4. Confirm TrueNAS can pull the images. Make GHCR packages public or configure registry credentials on TrueNAS.
5. Keep the prior Compose configuration and image tags available for rollback.

For local development, use `compose.yaml` and the repository's development scripts on a development machine. To exercise a release candidate on TrueNAS, publish uniquely versioned candidate images to a registry reachable by TrueNAS, then apply their tags through the Custom App configuration workflow below. Avoid reusing a published tag for changed image contents.

## Storage and credentials

Create two datasets in the TrueNAS UI before installation:

- An aria2 config dataset mounted at `/mnt/<pool>/apps/aria-station/aria2-config`
- A download dataset mounted at `/mnt/<pool>/downloads` (or another chosen download location)

Set both dataset ACLs to allow read/write access for UID 568 and GID 568 (`apps`). Do not recursively change permissions on a dataset containing existing files unless intended. Aria2 exits with a diagnostic if it cannot write either mount.

Generate an RPC secret with `openssl rand -hex 32`. Set the same value for the Web and aria2 services. Set a separate Web password of at least 16 characters. Keep completed deployment YAML in a secure administrator-managed location; never commit credentials to this repository.

## First installation

1. Open **Apps → Discover Apps → Install via YAML**.
2. Use the application name `aria-station` and paste the contents of `aria-station.yaml` into Custom Config.
3. Replace the example dataset paths and secret placeholders with the values prepared above.
4. Confirm the published Web port (default `55290`) is available. Keep aria2 RPC port `6800` internal to the Compose network.
5. Save and wait for the application to reach **RUNNING**. Review workload state and logs if deployment does not complete.
6. Open `http://<nas-address>:55290/` (or the configured port), log in, and confirm Settings reports aria2 connected.
7. Add a small test download, confirm the file appears in the selected dataset, then remove the test task and clean up its file if appropriate.

The Web container runs as UID/GID 1000 with a read-only root filesystem. The aria2 container runs as UID/GID 568, stores its session under `/config`, and writes downloads under `/downloads`. Only the Web port and BitTorrent TCP/UDP port 51413 are published by the template. Router and firewall forwarding are separate network configuration.

HTTP Basic credentials are not encrypted over plain HTTP. Use HTTPS through a trusted reverse proxy or restrict access to a trusted LAN/VPN. The app does not provide user accounts, password reset, or per-user permissions.

## Upgrade an installed app

1. Confirm every referenced Web and aria2 image tag has been published and is accessible to TrueNAS.
2. Create ZFS snapshots of both datasets. The aria2 config dataset contains the session used for unfinished tasks; the download dataset contains payloads and aria2 control files.
3. Save the currently installed Custom App YAML and image tags as the rollback point.
4. Update the image tags in the intended Compose YAML. Use the same release version for both images when both were published for that release; otherwise retain the existing, verified aria2 image tag.
5. In **Apps → Installed → aria-station → Edit**, update Custom Config with the Compose YAML and save. An automated deployment may use the TrueNAS `app.update` API with `custom_compose_config_string`.
6. Wait for the app to return to **RUNNING**. Confirm the Web health check, aria2 connection, existing task list, and logs.
7. Add a small test download and confirm it is written to the expected dataset. Record the TrueNAS version, architecture, image tags, and verification results.

Manage the application through the TrueNAS Custom App configuration and lifecycle. Do not edit generated Compose files under `/mnt/.ix-apps/.../rendered/` or use a separate `docker compose` invocation to manage TrueNAS-created workloads; TrueNAS can regenerate those files from its saved application configuration.

The `/api/ready` health check confirms Web process readiness only. Confirm engine connectivity separately in Settings or through `/api/health`. An unavailable aria2 engine is reported by the app and does not trigger a Web container restart loop.

## Rollback and recovery

1. In the Custom App **Edit** screen, restore the prior Web and aria2 image tags and save the Compose configuration.
2. Wait for **RUNNING**, then confirm Web health, aria2 connectivity, task state, and files.
3. Restore dataset snapshots only when the failure requires reverting persisted configuration or download state. Restore the aria2 config and download datasets together when returning to a consistent recovery point; changing image tags alone does not restore bind-mounted data.
4. Retain the failed version's logs and image tags until the cause is understood.

There is no separate application-history database or database migration process yet. Update this procedure before introducing persistent application data or schema migrations.
