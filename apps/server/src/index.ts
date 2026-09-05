import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  reply
    .status(statusCode)
    .send({ error: error.message || "Unexpected server error" });
});

app.get("/api/health", async () => {
  const version = await rpc<{ version: string }>("getVersion");
  return { connected: true, version: version.version };
});

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
  ];
  const [active, waiting, stopped] = await Promise.all([
    rpc<AriaStatus[]>("tellActive", [fields]),
    rpc<AriaStatus[]>("tellWaiting", [0, 1_000, fields]),
    rpc<AriaStatus[]>("tellStopped", [0, 1_000, fields]),
  ]);
  return { tasks: [...active, ...waiting, ...stopped].map(task) };
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
    return {
      files: files.map((file) => ({
        index: number(file.index),
        path: file.path,
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

app.post<{
  Body: { uris?: unknown; folder?: unknown; torrentBase64?: unknown };
}>("/api/tasks", async (request, reply) => {
  const { uris = [], folder, torrentBase64 } = request.body ?? {};
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
  const options = { dir: downloadDirectory(folder) };
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

const webDist = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../web/dist",
);
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.get("/*", (_request, reply) => reply.sendFile("index.html"));
}

await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 55290),
});
