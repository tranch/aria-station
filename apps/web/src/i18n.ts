import en from "./locales/en.json";
declare const __APP_VERSION__: string;
// English-only catalog boundary. Replace this module with the chosen i18n runtime
// when additional locales are introduced; do not concatenate translated sentences.
export const messages = { ...en, version: `v${__APP_VERSION__}` };
export const detailTabs = {
  overview: en.overview,
  files: en.files,
  connections: en.connections,
};
export const directories = {
  downloads: en.downloads,
  images: en.images,
  video: en.video,
  music: en.music,
  documents: en.documents,
};
const rules = new Intl.PluralRules("en");
const number = new Intl.NumberFormat("en");
function plural(one: string, other: string, count: number) {
  return (rules.select(count) === "one" ? one : other).replace(
    "{count}",
    number.format(count),
  );
}
export const downloadCount = (n: number) =>
  plural(en.download_one, en.download_other, n);
export const connectionCount = (n: number) =>
  plural(en.connection_one, en.connection_other, n);
export const peerCount = (n: number) => plural(en.peer_one, en.peer_other, n);
export const downloadsAdded = (n: number) =>
  plural(en.added_one, en.added_other, n);
export const removeConfirmation = (n: number) =>
  plural(en.remove_one, en.remove_other, n);
export const downloadAction = (action: "pause" | "start", n: number) =>
  action === "pause"
    ? plural(en.paused_one, en.paused_other, n)
    : plural(en.resumed_one, en.resumed_other, n);
export const selectedCount = (n: number) =>
  en.selected.replace("{count}", number.format(n));
export const queuedCount = (n: number) =>
  en.queuedCount.replace("{count}", number.format(n));
export const selectDownload = (name: string) =>
  en.selectDownload.replace("{name}", name);
