import {
  messages,
  detailTabs,
  directories,
  downloadAction,
  downloadsAdded,
  selectedCount,
  selectDownload,
  downloadCount,
  queuedCount,
  connectionCount,
  peerCount,
  removeConfirmation,
} from "./i18n";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "boxicons/css/boxicons.min.css";
import "./style.css";
import { eta, rate, states, size, type Task } from "./data";
import { product } from "./product";
const Icon = ({ name }: { name: string }) => (
  <i className={`bx bx-${name}`} aria-hidden="true" />
);
type TaskDetails = {
  files: Array<{
    index: number;
    path: string;
    totalBytes: number;
    completedBytes: number;
    selected: boolean;
  }>;
  peers: Array<{
    address: string;
    client: string;
    downloadSpeed: number;
    uploadSpeed: number;
    seeder: boolean;
  }>;
};
type Health = { connected: true; version: string };
function App() {
  const [tasks, setTasks] = useState<Task[]>([]),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState(""),
    [tab, setTab] = useState("overview"),
    [collapsed, setCollapsed] = useState(() => window.innerWidth < 768),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState<"add" | "remove" | "settings" | null>(null),
    [input, setInput] = useState(""),
    [folder, setFolder] = useState("downloads"),
    [notice, setNotice] = useState(""),
    [offline, setOffline] = useState(true),
    [sort, setSort] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [torrent, setTorrent] = useState<File | null>(null),
    [height, setHeight] = useState(258),
    [details, setDetails] = useState<TaskDetails | null>(null),
    [health, setHealth] = useState<Health | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    document.title = product.documentTitle;
  }, []);
  useEffect(() => {
    if (!detail || (tab !== "files" && tab !== "connections")) return;
    setDetails(null);
    fetch(`/api/tasks/${detail}/details`)
      .then(async (response) => {
        const body = (await response.json()) as TaskDetails & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error ?? "Unable to load task details");
        setDetails(body);
      })
      .catch((error: unknown) =>
        notify(
          error instanceof Error
            ? error.message
            : "Unable to load task details",
        ),
      );
  }, [detail, tab]);
  useEffect(() => {
    if (modal !== "settings") return;
    setHealth(null);
    fetch("/api/health")
      .then(async (response) => {
        const body = (await response.json()) as Health & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "aria2 is unreachable");
        setHealth(body);
      })
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : "aria2 is unreachable"),
      );
  }, [modal]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refreshTasks = async () => {
    try {
      const response = await fetch("/api/tasks");
      const body = (await response.json()) as {
        tasks?: Task[];
        error?: string;
      };
      if (!response.ok || !body.tasks)
        throw new Error(body.error ?? "Unable to load downloads");
      setTasks(body.tasks);
      setSelected((previous) =>
        previous.filter((id) => body.tasks!.some((task) => task.id === id)),
      );
      setDetail((previous) =>
        body.tasks!.some((task) => task.id === previous) ? previous : "",
      );
      setOffline(false);
    } catch (error) {
      setOffline(true);
      if (error instanceof Error && !tasks.length) setNotice(error.message);
    }
  };
  useEffect(() => {
    void refreshTasks();
    const timer = window.setInterval(() => void refreshTasks(), 2_000);
    return () => window.clearInterval(timer);
  }, []);
  const visible = tasks
    .filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        t.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => (sort ? a.name.localeCompare(b.name) : 0));
  const current = tasks.find((t) => t.id === detail),
    picked = tasks.filter((t) => selected.includes(t.id));
  const download = tasks.reduce(
      (n, t) => n + (t.status === "active" ? t.speed : 0),
      0,
    ),
    upload = tasks.reduce((n, t) => n + t.upload, 0);
  const notify = (s: string) => setNotice(s);
  const change = async (action: "pause" | "start") => {
    const eligible = picked.filter((task) =>
      action === "pause"
        ? ["active", "waiting", "seeding"].includes(task.status)
        : task.status === "paused",
    );
    const results = await Promise.allSettled(
      eligible.map((task) =>
        fetch(
          `/api/tasks/${task.id}/${action === "pause" ? "pause" : "resume"}`,
          { method: "POST" },
        ).then(async (response) => {
          if (!response.ok)
            throw new Error(
              ((await response.json()) as { error?: string }).error ??
                "aria2 rejected the operation",
            );
        }),
      ),
    );
    const succeeded = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    notify(downloadAction(action, succeeded));
    await refreshTasks();
  };
  const toggle = (id: string) =>
    setSelected(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  async function add() {
    const lines = input
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length && !torrent) {
      notify(messages.missingDownloadSource);
      return;
    }
    if (
      lines.some((s) => {
        try {
          return !["http:", "https:", "ftp:", "magnet:"].includes(
            new URL(s).protocol,
          );
        } catch {
          return true;
        }
      })
    ) {
      notify(messages.invalidDownloadUrl);
      return;
    }
    try {
      const torrentBase64 = torrent
        ? btoa(
            Array.from(new Uint8Array(await torrent.arrayBuffer()), (byte) =>
              String.fromCharCode(byte),
            ).join(""),
          )
        : undefined;
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uris: lines, folder, torrentBase64 }),
      });
      const body = (await response.json()) as {
        gids?: string[];
        error?: string;
      };
      if (!response.ok || !body.gids)
        throw new Error(body.error ?? "aria2 rejected the download");
      setFilter("all");
      setQuery("");
      setSelected(body.gids);
      setDetail(body.gids[0]);
      setModal(null);
      setInput("");
      setTorrent(null);
      notify(downloadsAdded(body.gids.length));
      await refreshTasks();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to add download.",
      );
    }
  }
  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.name.endsWith(".torrent") || file.size > 10 * 1024 * 1024) {
      notify(messages.invalidTorrentFile);
      return;
    }
    setTorrent(file);
  }
  const nav = [
    ["all", messages.allDownloads, "collection"],
    ...Object.entries(states).map(([key, v]) => [key, v.label, v.icon]),
  ];
  return (
    <div className="shell">
      <aside className={drawer ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setFilter("all");
          }}
        >
          <span className="brand-icon">
            <Icon name="download" />
          </span>
          <span>
            {product.shortName}
            <span className="brand-sub">{product.subtitle}</span>
          </span>
        </a>
        <div className="workspace-label">
          {messages.workspace}
          <span>{messages.personalNAS}</span>
        </div>
        <nav>
          {nav.map(([key, label, icon]) => (
            <button
              key={key}
              className={filter === key ? "nav-item active" : "nav-item"}
              onClick={() => {
                setFilter(key);
                setDrawer(false);
              }}
            >
              <Icon name={icon} />
              <span>{label}</span>
              <small>
                {key === "all"
                  ? tasks.length
                  : tasks.filter((t) => t.status === key).length}
              </small>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Icon name="cog" />
            <span>{messages.settings}</span>
          </button>
          <div className="instance">
            <span className="server-icon">
              <Icon name="server" />
            </span>
            <div>
              <strong>{messages.aria2Engine}</strong>
              <small>{offline ? messages.offline : messages.connected}</small>
            </div>
            <span className={offline ? "dot muted" : "dot"} />
          </div>
        </div>
      </aside>
      {drawer && (
        <button
          className="scrim"
          aria-label={messages.closeNavigation}
          onClick={() => setDrawer(false)}
        />
      )}
      <main>
        <section className="page-heading">
          <button
            className="icon-button menu"
            aria-label={messages.openNavigation}
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <div>
            <h1>
              {nav.find((n) => n[0] === filter)?.[1]}
              <span>{visible.length}</span>
            </h1>
          </div>
          <button className="primary" onClick={() => setModal("add")}>
            <Icon name="plus" />
            {messages.addDownload}
          </button>
        </section>
        <section className="metrics">
          <div className="metric">
            <span className="metric-icon blue">
              <Icon name="download" />
            </span>
            <div>
              <p>{messages.downloadSpeed}</p>
              <strong>{offline ? "—" : rate(download)}</strong>
            </div>
          </div>
          <div className="metric">
            <span className="metric-icon teal">
              <Icon name="upload" />
            </span>
            <div>
              <p>{messages.uploadSpeed}</p>
              <strong>{offline ? "—" : rate(upload)}</strong>
            </div>
          </div>
          <div className="metric summary">
            <span className="metric-icon purple">
              <Icon name="layer" />
            </span>
            <div>
              <p>{messages.activeDownloads}</p>
              <strong>
                {tasks.filter((t) => t.status === "active").length}
              </strong>
            </div>
            <span className="summary-note">
              {queuedCount(tasks.filter((t) => t.status === "waiting").length)}
            </span>
          </div>
        </section>
        {offline && (
          <div className="offline">
            <Icon name="wifi-off" />
            {messages.connectionLost}
            <button
              onClick={() => {
                void refreshTasks();
              }}
            >
              {messages.reconnect}
            </button>
          </div>
        )}
        <section className="task-panel">
          <div className="toolbar">
            <div className="actions">
              <span className="selection-label">
                {selected.length
                  ? selectedCount(selected.length)
                  : messages.selectDownloads}
              </span>
              <button
                className="icon-button"
                title={messages.resume}
                aria-label={messages.resumeSelectedDownloads}
                disabled={
                  offline ||
                  !picked.some((t) =>
                    ["paused", "waiting", "error"].includes(t.status),
                  )
                }
                onClick={() => change("start")}
              >
                <Icon name="play" />
              </button>
              <button
                className="icon-button"
                title={messages.pause}
                aria-label={messages.pauseSelectedDownloads}
                disabled={
                  offline ||
                  !picked.some((t) =>
                    ["active", "waiting", "seeding"].includes(t.status),
                  )
                }
                onClick={() => change("pause")}
              >
                <Icon name="pause" />
              </button>
              <span className="divider" />
              <button
                className="icon-button"
                title={messages.remove}
                aria-label={messages.removeSelectedDownloads}
                disabled={offline || !picked.length}
                onClick={() => setModal("remove")}
              >
                <Icon name="trash" />
              </button>
            </div>
            <label className="search">
              <Icon name="search" />
              <input
                aria-label={messages.searchDownloads}
                placeholder={messages.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  aria-label={messages.clearSearch}
                  onClick={() => setQuery("")}
                >
                  <Icon name="x" />
                </button>
              )}
            </label>
            <button
              className="icon-button"
              aria-label={messages.sortByName}
              title={messages.sortByName}
              aria-pressed={sort}
              onClick={() => setSort(!sort)}
            >
              <Icon name="sort-a-z" />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="check-cell">
                    <input
                      type="checkbox"
                      aria-label={messages.selectAllVisibleDownloads}
                      checked={
                        visible.length > 0 &&
                        visible.every((t) => selected.includes(t.id))
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? Array.from(
                                new Set([
                                  ...selected,
                                  ...visible.map((t) => t.id),
                                ]),
                              )
                            : selected.filter(
                                (id) => !visible.some((t) => t.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  <th className="name-col">{messages.name}</th>
                  <th className="size-col">{messages.size}</th>
                  <th className="progress-col">{messages.progress}</th>
                  <th>{messages.status}</th>
                  <th className="speed-col">{messages.downloadSpeed}</th>
                  <th className="eta-col">{messages.timeLeft}</th>
                  <th className="folder-col">{messages.location}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    className={selected.includes(t.id) ? "selected" : ""}
                    tabIndex={0}
                    aria-selected={selected.includes(t.id)}
                    onClick={() => {
                      setSelected([t.id]);
                      setDetail(t.id);
                      setCollapsed(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected([t.id]);
                        setDetail(t.id);
                        setCollapsed(false);
                      }
                      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                        e.preventDefault();
                        const next =
                          e.key === "ArrowDown"
                            ? e.currentTarget.nextElementSibling
                            : e.currentTarget.previousElementSibling;
                        (next as HTMLElement | null)?.focus();
                      }
                    }}
                  >
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        aria-label={selectDownload(t.name)}
                        checked={selected.includes(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => {
                          toggle(t.id);
                          setDetail(t.id);
                        }}
                      />
                    </td>
                    <td title={t.name}>
                      <div className="file-name">
                        <span
                          className={`file-icon ${t.folder === "video" ? "video" : t.folder === "music" ? "music" : ""}`}
                        >
                          <Icon
                            name={
                              t.folder === "video"
                                ? "movie-play"
                                : t.folder === "music"
                                  ? "music"
                                  : t.name.endsWith(".iso")
                                    ? "disc"
                                    : "file-blank"
                            }
                          />
                        </span>
                        <span>
                          {t.name}
                          <small>{t.type}</small>
                        </span>
                      </div>
                    </td>
                    <td className="size-col">
                      {t.totalBytes ? size(t.totalBytes) : messages.unknown}
                    </td>
                    <td className="progress-col numeric">
                      <div className={`progress ${t.status}`}>
                        <span style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="progress-number">
                        {t.progress.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`status ${t.status}`}>
                        <Icon name={states[t.status].icon} />
                        {states[t.status].label}
                      </span>
                    </td>
                    <td className="speed-col numeric">
                      {t.status === "active" ? rate(t.speed) : "—"}
                    </td>
                    <td className="eta-col numeric">
                      {t.status === "active" ? eta(t) : "—"}
                    </td>
                    <td className="folder-col">
                      <span className="folder">
                        <Icon name="folder" />
                        {directories[t.folder as keyof typeof directories] ??
                          t.folder}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className="empty">
                <Icon name="inbox" />
                <h3>
                  {query ? messages.noMatchingDownloads : messages.noDownloads}
                </h3>
                <p>
                  {query
                    ? messages.searchEmptyDescription
                    : messages.emptyDescription}
                </p>
                <button
                  onClick={() => (query ? setQuery("") : setModal("add"))}
                >
                  {query ? messages.clearSearch : messages.addDownload}
                </button>
              </div>
            )}
          </div>
          <div className="table-footer">
            <span>
              {downloadCount(visible.length)}
              {selected.length > 0 && ` · ${selectedCount(selected.length)}`}
            </span>
            <span>
              <span className="dot" />
              {offline
                ? messages.connectionDataMayBeStale
                : messages.engineDataRefreshed}
            </span>
          </div>
        </section>
        {current && (
          <section
            className={`details ${collapsed ? "collapsed" : ""}`}
            style={{ height: collapsed ? 49 : height }}
          >
            <div
              className="resize-handle"
              role="separator"
              aria-label={messages.resizeDetails}
              aria-orientation="horizontal"
              aria-valuenow={height}
              aria-valuemin={190}
              aria-valuemax={420}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") setHeight(Math.min(420, height + 20));
                if (e.key === "ArrowDown")
                  setHeight(Math.max(190, height - 20));
              }}
              onPointerDown={(e) => {
                const y = e.clientY,
                  h = height,
                  target = e.currentTarget;
                target.setPointerCapture(e.pointerId);
                target.onpointermove = (ev) =>
                  setHeight(Math.max(190, Math.min(420, h + y - ev.clientY)));
                target.onpointerup = () => {
                  target.onpointermove = null;
                };
              }}
            />
            <div className="detail-heading">
              <div className="tabs">
                {["overview", "files", "connections"].map((s) => (
                  <button
                    className={tab === s ? "active" : ""}
                    key={s}
                    onClick={() => {
                      setTab(s);
                      setCollapsed(false);
                    }}
                  >
                    {detailTabs[s as keyof typeof detailTabs]}
                    {s === "files" && details && (
                      <small>{details.files.length}</small>
                    )}
                  </button>
                ))}
              </div>
              <span className="detail-name">{current.name}</span>
              <button
                className="icon-button"
                aria-label={
                  collapsed ? messages.expandDetails : messages.collapseDetails
                }
                onClick={() => setCollapsed(!collapsed)}
              >
                <Icon name={collapsed ? "chevron-up" : "chevron-down"} />
              </button>
            </div>
            {!collapsed && (
              <div className="detail-content">
                {tab === "overview" ? (
                  <>
                    <div className="detail-title">
                      <span className="file-icon large">
                        <Icon
                          name={
                            current.name.endsWith(".iso")
                              ? "disc"
                              : "file-blank"
                          }
                        />
                      </span>
                      <div>
                        <h3>{current.name}</h3>
                        <p>
                          {current.type} <span>·</span> GID{" "}
                          {current.id.padEnd(16, "0")}
                        </p>
                      </div>
                      <span className={`status ${current.status}`}>
                        <Icon name={states[current.status].icon} />
                        {states[current.status].label}
                      </span>
                    </div>
                    {current.status === "error" && (
                      <p className="error-message">
                        {current.errorMessage ?? messages.diskWriteError}
                      </p>
                    )}
                    <div className="detail-grid">
                      <div>
                        <span>{messages.downloadedTotal}</span>
                        <strong>
                          {current.totalBytes
                            ? `${size(current.completedBytes)} / ${size(current.totalBytes)}`
                            : messages.waitingForMetadata}
                        </strong>
                      </div>
                      <div>
                        <span>{messages.downloadSpeed}</span>
                        <strong>{rate(current.speed)}</strong>
                      </div>
                      <div>
                        <span>
                          {current.type === "BT"
                            ? messages.peers
                            : messages.connections}
                        </span>
                        <strong>
                          {current.type === "BT"
                            ? peerCount(current.peers)
                            : connectionCount(current.peers)}
                        </strong>
                      </div>
                      <div>
                        <span>{messages.directoryOnDownloadEngine}</span>
                        <strong>
                          {current.folder === "downloads"
                            ? "/downloads"
                            : `/downloads/${current.folder}`}
                        </strong>
                      </div>
                      <div>
                        <span>{messages.uploadSpeed}</span>
                        <strong>{rate(current.upload)}</strong>
                      </div>
                    </div>
                  </>
                ) : tab === "files" ? (
                  <div className="file-detail">
                    {!details
                      ? messages.loadingDetails
                      : details.files.length === 0
                        ? messages.noFiles
                        : details.files.map((file) => (
                            <div className="file-row" key={file.index}>
                              <Icon
                                name={file.selected ? "file" : "file-blank"}
                              />
                              <span>{file.path}</span>
                              <small>
                                {size(file.completedBytes)} /{" "}
                                {size(file.totalBytes)}
                              </small>
                            </div>
                          ))}
                  </div>
                ) : (
                  <div className="connection-detail">
                    <Icon name="transfer-alt" />
                    {!details ? (
                      <p>{messages.loadingDetails}</p>
                    ) : current.type !== "BT" ? (
                      <p>{messages.peersOnlyForBitTorrent}</p>
                    ) : details.peers.length === 0 ? (
                      <p>{messages.noPeers}</p>
                    ) : (
                      <div className="peer-list">
                        {details.peers.map((peer) => (
                          <div className="peer-row" key={peer.address}>
                            <strong>{peer.address}</strong>
                            <span>{peer.client || messages.unknownClient}</span>
                            <small>
                              {rate(peer.downloadSpeed)} ↓ ·{" "}
                              {rate(peer.uploadSpeed)} ↑
                              {peer.seeder ? ` · ${messages.seeder}` : ""}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
        <footer>
          <span>
            <Icon name="server" />
            {product.name}{" "}
            <span className="footer-version">{messages.version}</span>
          </span>
          <span>
            <Icon name="down-arrow-alt" />
            {offline ? "—" : rate(download)} <Icon name="up-arrow-alt" />
            {offline ? "—" : rate(upload)}
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="modal-header">
          <div>
            <h2>
              {modal === "add"
                ? messages.addDownload
                : modal === "remove"
                  ? messages.removeSelectedDownloads
                  : messages.settings}
            </h2>
            <p>
              {modal === "add"
                ? messages.addURLsOrATorrentFile
                : messages.engineDiagnostics}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label={messages.closeDialog}
            onClick={() => setModal(null)}
          >
            <Icon name="x" />
          </button>
        </div>
        {modal === "add" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="field">
              {messages.downloadURLs}
              <textarea
                autoFocus
                placeholder={
                  "https://example.com/file.zip\nmagnet:?xt=urn:btih:…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <small>{messages.urlInputHelp}</small>
            </label>
            <label
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                chooseFile(e.dataTransfer.files[0]);
              }}
            >
              <Icon name="cloud-upload" />
              <strong>
                {torrent ? torrent.name : messages.chooseOrDropATorrentFile}
              </strong>
              <small>{messages.torrentUpTo10MB}</small>
              <input
                type="file"
                accept=".torrent"
                onChange={(e) => chooseFile(e.target.files?.[0])}
              />
            </label>
            <label className="field">
              {messages.downloadDirectory}
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                {["downloads", "images", "video", "music", "documents"].map(
                  (f) => (
                    <option key={f} value={f}>
                      {directories[f as keyof typeof directories]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button
              className="advanced"
              type="button"
              onClick={() => setAdvanced(!advanced)}
            >
              <Icon name={advanced ? "chevron-down" : "chevron-right"} />
              {messages.advancedOptions}
            </button>
            {advanced && (
              <p className="hint">{messages.advancedOptionsUnavailable}</p>
            )}
            <div className="modal-footer">
              <span>{messages.noFilesWillBeDownloaded}</span>
              <button type="button" onClick={() => setModal(null)}>
                {messages.cancel}
              </button>
              <button className="primary" type="submit">
                {messages.addDownload}
              </button>
            </div>
          </form>
        ) : modal === "remove" ? (
          <>
            <p className="remove-copy">
              {removeConfirmation(picked.length)}
              <strong>{messages.downloadedFilesWillRemainOnDisk}</strong>
            </p>
            <div className="modal-footer">
              <button onClick={() => setModal(null)}>{messages.cancel}</button>
              <button
                className="danger"
                onClick={async () => {
                  const results = await Promise.allSettled(
                    selected.map((id) =>
                      fetch(`/api/tasks/${id}`, { method: "DELETE" }).then(
                        async (response) => {
                          if (!response.ok)
                            throw new Error(
                              ((await response.json()) as { error?: string })
                                .error ?? "aria2 rejected removal",
                            );
                        },
                      ),
                    ),
                  );
                  const succeeded = results.filter(
                    (result) => result.status === "fulfilled",
                  ).length;
                  setModal(null);
                  notify(
                    succeeded === selected.length
                      ? messages.downloadsRemovedFilesOnDiskAreUnchanged
                      : `${succeeded} of ${selected.length} downloads removed.`,
                  );
                  await refreshTasks();
                }}
              >
                {messages.removeDownloads}
              </button>
            </div>
          </>
        ) : (
          <div className="settings">
            <p>
              {health
                ? `${messages.engineConnected} aria2 ${health.version}`
                : messages.checkingEngine}
            </p>
            <button
              onClick={() => {
                void refreshTasks();
                setModal(null);
              }}
            >
              <Icon name="refresh" />
              {messages.refreshConnection}
            </button>
            <p className="hint">{messages.settingsComingSoon}</p>
          </div>
        )}
      </dialog>
      {notice && (
        <div className="toast" role="status">
          <Icon name="info-circle" />
          {notice}
          <button
            aria-label={messages.dismissNotification}
            onClick={() => setNotice("")}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
