import { messages } from "./i18n";
export type Status =
  | "active"
  | "waiting"
  | "paused"
  | "complete"
  | "error"
  | "seeding";
export type Task = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: Status;
  speed: number;
  upload: number;
  type: string;
  folder: string;
  peers: number;
};
export const states: Record<Status, { label: string; icon: string }> = {
  active: { label: messages.downloading, icon: "down-arrow-circle" },
  waiting: { label: messages.queued, icon: "time-five" },
  paused: { label: messages.paused, icon: "pause-circle" },
  complete: { label: messages.completed, icon: "check-circle" },
  error: { label: messages.failed, icon: "error-circle" },
  seeding: { label: messages.seeding, icon: "up-arrow-circle" },
};
export const initialTasks: Task[] = [
  {
    id: "a01",
    name: "ubuntu-24.04.3-desktop-amd64.iso",
    size: 6.2,
    progress: 68.4,
    status: "active",
    speed: 12.8,
    upload: 0,
    type: "HTTP",
    folder: "images",
    peers: 8,
  },
  {
    id: "a02",
    name: "Blender 4.5 — Spring Open Movie",
    size: 2.84,
    progress: 42.6,
    status: "active",
    speed: 8.42,
    upload: 0.64,
    type: "BT",
    folder: "video",
    peers: 24,
  },
  {
    id: "a03",
    name: "debian-13.0.0-amd64-netinst.iso",
    size: 0.79,
    progress: 86.2,
    status: "active",
    speed: 3.36,
    upload: 0,
    type: "HTTP",
    folder: "images",
    peers: 4,
  },
  {
    id: "a04",
    name: "Nature Sounds — Lossless Audio.zip",
    size: 1.46,
    progress: 0,
    status: "waiting",
    speed: 0,
    upload: 0,
    type: "HTTP",
    folder: "music",
    peers: 0,
  },
  {
    id: "a05",
    name: "Fedora-Workstation-Live-42-1.1.x86_64.iso",
    size: 2.58,
    progress: 31.8,
    status: "paused",
    speed: 0,
    upload: 0,
    type: "BT",
    folder: "images",
    peers: 0,
  },
  {
    id: "a06",
    name: "Big Buck Bunny — 4K.mkv",
    size: 3.72,
    progress: 100,
    status: "seeding",
    speed: 0,
    upload: 1.2,
    type: "BT",
    folder: "video",
    peers: 12,
  },
  {
    id: "a07",
    name: "Figma Design Resources.zip",
    size: 0.34,
    progress: 100,
    status: "complete",
    speed: 0,
    upload: 0,
    type: "HTTP",
    folder: "documents",
    peers: 0,
  },
  {
    id: "a08",
    name: "Alpine-linux-3.22.1-x86_64.iso",
    size: 0.27,
    progress: 100,
    status: "complete",
    speed: 0,
    upload: 0,
    type: "HTTP",
    folder: "images",
    peers: 0,
  },
  {
    id: "a09",
    name: "Creative Commons Photography.zip",
    size: 4.18,
    progress: 23.5,
    status: "error",
    speed: 0,
    upload: 0,
    type: "HTTP",
    folder: "documents",
    peers: 0,
  },
];
export const size = (n: number) =>
  n >= 1 ? `${n.toFixed(2)} GB` : `${(n * 1024).toFixed(0)} MB`;
