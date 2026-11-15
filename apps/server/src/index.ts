import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import Database from "better-sqlite3";
import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

type AriaStatus = {
  gid: string;
  status: "active" | "waiting" | "paused" | "error" | "complete" | "removed";
  totalLength: string;
  completedLength: string;
  downloadSpeed: string;
  uploadSpeed: string;
  errorMessage?: string;
  dir?: string;
  files?: Array<{ path?: string }>;
  bittorrent?: unknown;
  numSeeders?: string;
  connections?: string;
  followedBy?: string[];
  following?: string;
};

type RpcReply<T> = {
  id: string;
  result?: T;
  error?: { code: number; message: string };
};
type AriaFile = {
  index: string;
  path: string;
  length: string;
  completedLength: string;
  selected: "true" | "false";
};
type AriaPeer = {
  ip: string;
  port: string;
  client: string;
  downloadSpeed: string;
  uploadSpeed: string;
  seeder: "true" | "false";
};
type AriaOptions = { "max-download-limit"?: string; dir?: string };

const rpcUrl = process.env.ARIA2_RPC_URL ?? "http://127.0.0.1:6800/jsonrpc";
const rpcSecret = process.env.ARIA2_RPC_SECRET;
const downloadRoot = process.env.DOWNLOAD_ROOT ?? "/downloads";
const allowedFolders = new Set([
  "downloads",
  "images",
  "video",
  "music",
  "documents",
]);

const appDataDir = resolve(process.env.APP_DATA_DIR ?? "./.data/app");
mkdirSync(appDataDir, { recursive: true, mode: 0o700 });
const database = new Database(resolve(appDataDir, "aria-station.sqlite"));
chmodSync(resolve(appDataDir, "aria-station.sqlite"), 0o600);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_history (
    gid TEXT PRIMARY KEY, task_json TEXT NOT NULL, observed_at INTEGER NOT NULL
  );
`);
const setting = database.prepare("SELECT value FROM settings WHERE key = ?");
const adminConfigured = () => Boolean(setting.get("admin_username"));
const sessionDays = 30;
const cookieName = "aria_station_session";
const secureCookies =
  process.env.COOKIE_SECURE === "true" ||
  (process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production");

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionValid(token: string | undefined) {
  if (!token || !adminConfigured()) return false;
  const row = database
    .prepare("SELECT expires_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash(token)) as { expires_at: number } | undefined;
  if (!row) return false;
  if (row.expires_at <= Date.now()) {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
    return false;
  }
  return true;
}

const saveHistory = database.prepare(`
  INSERT INTO task_history (gid, task_json, observed_at) VALUES (?, ?, ?)
  ON CONFLICT(gid) DO UPDATE SET task_json=excluded.task_json, observed_at=excluded.observed_at
`);
const loadHistory = () =>
  (database.prepare("SELECT task_json FROM task_history ORDER BY observed_at DESC").all() as Array<{task_json:string}>)
    .map((row) => JSON.parse(row.task_json) as ReturnType<typeof task>);

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function rpcParams(params: unknown[]) {
  return rpcSecret ? [`token:${rpcSecret}`, ...params] : params;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: `aria2.${method}`,
        params: rpcParams(params),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new HttpError(503, "aria2 is unreachable");
  }
  if (!response.ok)
    throw new HttpError(503, "aria2 RPC returned an unavailable response");
  const payload = (await response.json()) as RpcReply<T>;
  if (payload.error) throw new HttpError(422, payload.error.message);
  if (payload.result === undefined)
    throw new HttpError(502, "aria2 RPC returned no result");
  return payload.result;
}

function number(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function task(status: AriaStatus) {
  const total = number(status.totalLength);
  const completed = number(status.completedLength);
  const isSeeding =
    Boolean(status.bittorrent) &&
    total > 0 &&
    completed >= total &&
    status.status === "active";
  const file = status.files?.[0]?.path?.split("/").pop();
  const folder =
    status.dir === downloadRoot
      ? "downloads"
      : status.dir?.startsWith(`${downloadRoot}/`)
        ? status.dir.slice(downloadRoot.length + 1)
        : (status.dir ?? "downloads");
  return {
    id: status.gid,
    name: file || status.gid,
    totalBytes: total,
    completedBytes: completed,
    progress: total ? Math.min(100, (completed / total) * 100) : 0,
    status: isSeeding ? "seeding" : status.status,
    engineStatus: status.status,
    speed: number(status.downloadSpeed),
    upload: number(status.uploadSpeed),
    type: status.bittorrent ? "BT" : "HTTP",
    folder,
    peers: number(status.numSeeders ?? status.connections),
    errorMessage: status.errorMessage,
    followedBy: status.followedBy ?? [],
    following: status.following,
  };
}

function downloadDirectory(folder: unknown) {
  if (typeof folder !== "string" || !allowedFolders.has(folder)) {
    throw new HttpError(
      400,
      "Choose one of the configured download directories",
    );
  }
  return folder === "downloads" ? downloadRoot : `${downloadRoot}/${folder}`;
}

function validUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:", "ftp:", "magnet:"].includes(
      new URL(value).protocol,
    );
  } catch {
    return false;
  }
}

const app = Fastify({ logger: true });
const events = new WebSocketServer({ noServer: true });
await app.register(fastifyCookie);

app.addHook("onRequest", async (request, reply) => {
  const publicPath = ["/api/ready", "/api/auth/status", "/api/auth/setup", "/api/auth/login"].includes(request.url.split("?")[0]);
  if (publicPath || sessionValid(request.cookies[cookieName])) {
    const origin = request.headers.origin;
    if (
      origin &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      (() => {
        try {
          return new URL(origin).host !== request.headers.host;
        } catch {
          return true;
        }
      })()
    )
      return reply.code(403).send({ error: "Cross-origin request rejected" });
    return;
  }
  return reply.code(401).send({ error: "Authentication required" });
});

events.on("connection", (client) => {
  const upstreamUrl = rpcUrl.replace(/^http/, "ws");
  const upstream = new WebSocket(upstreamUrl);
  const close = () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    if (client.readyState === WebSocket.OPEN) client.close();
  };
  upstream.on("message", (message) => {
    if (client.readyState === WebSocket.OPEN) client.send(message.toString());
  });
  upstream.on("error", close);
  upstream.on("close", close);
  client.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
});

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  reply.status(statusCode).send({
    error:
      error instanceof Error && error.message
        ? error.message
        : "Unexpected server error",
  });
});

app.get("/api/health", async () => {
  const version = await rpc<{ version: string }>("getVersion");
  return { connected: true, version: version.version };
});

app.get("/api/ready", async () => ({ ready: true }));

app.get("/api/auth/status", async () => ({ setupRequired: !adminConfigured() }));

const loginFailures = new Map<string, { count: number; blockedUntil: number }>();
app.post<{ Body: { username?: unknown; password?: unknown } }>("/api/auth/setup", async (request, reply) => {
  if (adminConfigured()) throw new HttpError(409, "Administrator is already configured");
  const { username, password } = request.body ?? {};
  if (typeof username !== "string" || !/^[\p{L}\p{N}_.@-]{3,64}$/u.test(username))
    throw new HttpError(400, "Username must be 3–64 letters, numbers, or . _ @ -");
  if (typeof password !== "string" || password.length < 12 || password.length > 256)
    throw new HttpError(400, "Password must contain 12–256 characters");
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const insert = database.prepare("INSERT INTO settings(key,value) VALUES (?,?)");
  const transaction = database.transaction(() => {
    insert.run("admin_username", username);
    insert.run("admin_password_hash", hash);
  });
  try { transaction(); } catch { throw new HttpError(409, "Administrator is already configured"); }
  return reply.code(201).send({ configured: true });
});

app.post<{ Body: { username?: unknown; password?: unknown } }>("/api/auth/login", async (request, reply) => {
  if (!adminConfigured()) throw new HttpError(409, "Complete administrator setup first");
  const key = request.ip;
  const failure = loginFailures.get(key);
  if (failure && failure.blockedUntil > Date.now()) throw new HttpError(429, "Too many login attempts; try again later");
  const { username, password } = request.body ?? {};
  const expectedUser = setting.get("admin_username") as { value: string };
  const passwordHash = setting.get("admin_password_hash") as { value: string };
  const valid = typeof username === "string" && typeof password === "string" &&
    timingSafeEqual(createHash("sha256").update(username).digest(), createHash("sha256").update(expectedUser.value).digest()) &&
    await argon2.verify(passwordHash.value, password).catch(() => false);
  if (!valid) {
    const count = (failure?.count ?? 0) + 1;
    loginFailures.set(key, { count, blockedUntil: count >= 5 ? Date.now() + 60_000 : 0 });
    throw new HttpError(401, "Invalid username or password");
  }
  loginFailures.delete(key);
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  database.prepare("INSERT INTO sessions(token_hash,created_at,expires_at) VALUES (?,?,?)")
    .run(tokenHash(token), now, now + sessionDays * 24 * 60 * 60 * 1000);
  reply.setCookie(cookieName, token, { path: "/", httpOnly: true, sameSite: "strict", secure: secureCookies, maxAge: sessionDays * 24 * 60 * 60 });
  return { authenticated: true, username: expectedUser.value };
});

app.post("/api/auth/logout", async (request, reply) => {
  const token = request.cookies[cookieName];
  if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  reply.clearCookie(cookieName, { path: "/", httpOnly: true, sameSite: "strict", secure: secureCookies });
  return { authenticated: false };
});

app.get("/api/auth/me", async () => ({ username: (setting.get("admin_username") as {value:string}).value }));

app.get("/api/tasks", async () => {
  const fields = [
    "gid",
    "status",
    "totalLength",
    "completedLength",
    "downloadSpeed",
    "uploadSpeed",
    "errorMessage",
    "dir",
    "files",
    "bittorrent",
    "numSeeders",
    "connections",
    "followedBy",
    "following",
  ];
  const [active, waiting, stopped] = await Promise.all([
    rpc<AriaStatus[]>("tellActive", [fields]),
    rpc<AriaStatus[]>("tellWaiting", [0, 1_000, fields]),
    rpc<AriaStatus[]>("tellStopped", [0, 1_000, fields]),
  ]);
  const current = [...active, ...waiting, ...stopped].map(task);
  const observedAt = Date.now();
  const upsertMany = database.transaction((items: ReturnType<typeof task>[]) => {
    for (const item of items) saveHistory.run(item.id, JSON.stringify(item), observedAt);
  });
  upsertMany(current);
  const currentIds = new Set(current.map((item) => item.id));
  const history = loadHistory().filter((item) => !currentIds.has(item.id));
  return { tasks: [...current, ...history] };
});

app.get<{ Params: { gid: string } }>(
  "/api/tasks/:gid/details",
  async (request) => {
    const status = await rpc<AriaStatus>("tellStatus", [
      request.params.gid,
      ["bittorrent"],
    ]);
    const files = await rpc<AriaFile[]>("getFiles", [request.params.gid]);
    const peers = status.bittorrent
      ? await rpc<AriaPeer[]>("getPeers", [request.params.gid])
      : [];
    const options = await rpc<AriaOptions>("getOption", [request.params.gid]);
    return {
      options: {
        maxDownloadLimit: number(options["max-download-limit"]),
      },
      files: files.map((file) => ({
        index: number(file.index),
        path:
          status.dir && file.path.startsWith(`${status.dir}/`)
            ? file.path.slice(status.dir.length + 1)
            : (file.path.split("/").pop() ?? file.path),
        totalBytes: number(file.length),
        completedBytes: number(file.completedLength),
        selected: file.selected === "true",
      })),
      peers: peers.map((peer) => ({
        address: `${peer.ip}:${peer.port}`,
        client: peer.client,
        downloadSpeed: number(peer.downloadSpeed),
        uploadSpeed: number(peer.uploadSpeed),
        seeder: peer.seeder === "true",
      })),
    };
  },
);

app.patch<{
  Params: { gid: string };
  Body: { selectedFileIndexes?: unknown; maxDownloadLimit?: unknown };
}>("/api/tasks/:gid/options", async (request) => {
  const body = request.body ?? {};
  const options: Record<string, string> = {};
  if (body.maxDownloadLimit !== undefined) {
    if (
      typeof body.maxDownloadLimit !== "number" ||
      !Number.isInteger(body.maxDownloadLimit) ||
      body.maxDownloadLimit < 0 ||
      body.maxDownloadLimit > 1_000_000_000
    )
      throw new HttpError(
        400,
        "Download limit must be a whole number of bytes per second",
      );
    options["max-download-limit"] = String(body.maxDownloadLimit);
  }
  if (body.selectedFileIndexes !== undefined) {
    if (
      !Array.isArray(body.selectedFileIndexes) ||
      !body.selectedFileIndexes.every(
        (index) => Number.isInteger(index) && index > 0,
      )
    )
      throw new HttpError(400, "Selected file indexes are invalid");
    options["select-file"] = body.selectedFileIndexes.join(",");
  }
  if (!Object.keys(options).length)
    throw new HttpError(400, "No task options provided");
  await rpc<string>("changeOption", [request.params.gid, options]);
  return { gid: request.params.gid, options };
});

app.post<{
  Body: {
    uris?: unknown;
    folder?: unknown;
    torrentBase64?: unknown;
    maxDownloadLimit?: unknown;
    split?: unknown;
  };
}>("/api/tasks", async (request, reply) => {
  const {
    uris = [],
    folder,
    torrentBase64,
    maxDownloadLimit = 0,
    split = 5,
  } = request.body ?? {};
  if (!Array.isArray(uris) || !uris.every(validUri))
    throw new HttpError(
      400,
      "Each download must be an HTTP, HTTPS, FTP, or Magnet URL",
    );
  if (
    typeof torrentBase64 !== "undefined" &&
    (typeof torrentBase64 !== "string" || torrentBase64.length > 14_000_000)
  )
    throw new HttpError(400, "The torrent file is invalid or exceeds 10 MB");
  if (!uris.length && !torrentBase64)
    throw new HttpError(400, "Provide at least one URL or torrent file");
  if (
    typeof maxDownloadLimit !== "number" ||
    !Number.isInteger(maxDownloadLimit) ||
    maxDownloadLimit < 0 ||
    maxDownloadLimit > 1_000_000_000
  )
    throw new HttpError(
      400,
      "Download limit must be a whole number of bytes per second",
    );
  if (typeof split !== "number" || !Number.isInteger(split) || ![1, 2, 4, 8, 16].includes(split))
    throw new HttpError(400, "Thread count must be one of 1, 2, 4, 8, or 16");
  const options = {
    dir: downloadDirectory(folder),
    "max-download-limit": String(maxDownloadLimit),
    split: String(split),
  };
  const gids = await Promise.all(
    uris.map((uri) => rpc<string>("addUri", [[uri], options])),
  );
  if (torrentBase64)
    gids.push(await rpc<string>("addTorrent", [torrentBase64, [], options]));
  reply.status(201);
  return { gids };
});

app.post<{ Params: { gid: string } }>(
  "/api/tasks/:gid/pause",
  async (request) => ({
    gid: await rpc<string>("pause", [request.params.gid]),
  }),
);
app.post<{ Params: { gid: string } }>(
  "/api/tasks/:gid/resume",
  async (request) => ({
    gid: await rpc<string>("unpause", [request.params.gid]),
  }),
);

app.delete<{ Params: { gid: string } }>("/api/tasks/:gid", async (request) => {
  const status = await rpc<AriaStatus>("tellStatus", [
    request.params.gid,
    ["status"],
  ]);
  const method = ["complete", "error", "removed"].includes(status.status)
    ? "removeDownloadResult"
    : "remove";
  return { gid: await rpc<string>(method, [request.params.gid]) };
});

app.server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/api/events") {
    socket.destroy();
    return;
  }
  const cookies = Object.fromEntries((request.headers.cookie ?? "").split(";").map((part) => {
    const [name, ...rest] = part.trim().split("=");
    return [name, decodeURIComponent(rest.join("="))];
  }));
  if (!sessionValid(cookies[cookieName])) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (request.headers.origin) {
    try {
      if (new URL(request.headers.origin).host !== request.headers.host) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  events.handleUpgrade(request, socket, head, (client) =>
    events.emit("connection", client, request),
  );
});

const webDist = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.get("/*", (_request, reply) => reply.sendFile("index.html"));
}

const saveAriaSession = async () => {
  try { await rpc<string>("saveSession"); }
  catch (error) { app.log.warn({ err: error }, "Unable to request aria2 session save during shutdown"); }
};
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await saveAriaSession();
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.close();
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 55290),
});
