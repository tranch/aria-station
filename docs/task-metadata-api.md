# Persistent task metadata API

Aria Station stores task metadata independently of aria2, including semantic tags and an optional aria2-visible download path. This is a general Aria Station capability for its own task views and external clients. It does not depend on a specific download manager.

## Contract (v1)

Configure a high-entropy `ARIA_STATION_INTEGRATION_TOKEN` on Aria Station and send it as `Authorization: Bearer <token>`. Keep the token server-side. Metadata access is disabled when the setting is absent. Calls use the Aria Station base URL and `/api/integrations/v1` prefix.

| Method and path | Behavior |
| --- | --- |
| `PUT /tasks/{gid}` | Upsert `tags`, `source` (default `external`) and optional `downloadPath`. |
| `GET /tasks/{gid}` | Read metadata; unknown GIDs return empty tags and null optional fields. |
| `GET /tasks?tag={tag}&source={source}` | List up to 1,000 newest records, optionally filtering by exact tag and source. |
| `DELETE /tasks/{gid}` | Delete only metadata; it does not remove the aria2 task or downloaded files. |

Example write body:

```json
{
  "tags": ["movie", "整理待处理"],
  "source": "external",
  "downloadPath": "/downloads/movie"
}
```

The aria2 GID is the join key when managing aria2 tasks. A client should use the GID returned by aria2 and keep that exact identifier for later reads and updates. Do not substitute a torrent hash, filename, or client-local database ID. `downloadPath` is an optional absolute path as seen by the aria2 process; it is informational mapping data and does not move files. Each client must map its own view of storage to the same underlying location.

Tags are opaque UTF-8 strings, trimmed and deduplicated by Aria Station. At most 64 tags of 128 characters each are accepted. Updates replace the full tag set. SQLite persists metadata across Aria Station process/container restarts. GIDs may be reused after aria2 has forgotten a task; clients should delete metadata when their lifecycle ends or avoid reusing stale GIDs.

## Failure behavior

Clients that also operate aria2 should treat metadata calls as independent of aria2 RPC. A metadata API outage, timeout, rejected token, or error does not change the result of the base aria2 action; clients may retry metadata writes with bounded backoff and must not retry task creation solely because metadata persistence failed. Reading no metadata is equivalent to an untagged task. Do not infer that a task was organized or moved unless that workflow state is explicitly persisted by its owner.

The v1 API persists tags and path mapping only. It does not implement file movement, deletion, or a durable “organized” state. Those require an explicit lifecycle/ownership contract before automatic organization is safe.

## Security and deployment

The API is served by the same Aria Station service as the UI. Restrict network access to trusted services, use HTTPS across untrusted networks, and store the token in server-side secret configuration. Never put it in browser code or logs. The RPC secret remains private to Aria Station and is not part of this metadata contract.

To enable API access, set `ARIA_STATION_INTEGRATION_TOKEN` in the Aria Station service environment. For Compose deployments, add the variable to the `web` service environment (the token is not passed to aria2). Rotate it by changing the environment value and updating all clients.

## Using with MoviePilot

MoviePilot's native Aria2 downloader remains responsible for its normal task operations. It may use this API to persist and query tags by aria2 GID. Keep MoviePilot's existing path mapping configured independently; `downloadPath` records the aria2-side path and does not rewrite MoviePilot configuration. If metadata calls fail, MoviePilot's base Aria2 downloads continue to work. This client-specific behavior does not define or limit the general metadata API.
