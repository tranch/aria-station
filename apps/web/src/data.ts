import { messages } from "./i18n";
export type Status = "active" | "waiting" | "paused" | "complete" | "error" | "removed" | "seeding";
export type Task = {
  id: string;
  name: string;
  totalBytes: number;
  completedBytes: number;
  progress: number;
  status: Status;
  engineStatus: Exclude<Status, "seeding">;
  speed: number;
  upload: number;
  type: string;
  folder: string;
  peers: number;
  errorMessage?: string;
  followedBy?: string[];
  following?: string;
};
export const states: Record<Status, { label: string; icon: string }> = {
  active: { label: messages.downloading, icon: "down-arrow-circle" },
  waiting: { label: messages.queued, icon: "time-five" },
  paused: { label: messages.paused, icon: "pause-circle" },
  complete: { label: messages.completed, icon: "check-circle" },
  error: { label: messages.failed, icon: "error-circle" },
  removed: { label: messages.removed, icon: "minus-circle" },
  seeding: { label: messages.seeding, icon: "up-arrow-circle" },
};
export const size = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return messages.unknown;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[unit]}`;
};
export const rate = (bytes: number) => (bytes > 0 ? `${size(bytes)}/s` : "—");
export const eta = (task: Task) => {
  if (task.speed <= 0 || task.totalBytes <= task.completedBytes) return "—";
  const seconds = Math.ceil((task.totalBytes - task.completedBytes) / task.speed);
  return seconds >= 3600 ? `${Math.ceil(seconds / 3600)} h` : `${Math.max(1, Math.ceil(seconds / 60))} min`;
};
