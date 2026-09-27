// Per-browser memory: the last view (so reopening the site continues where you
// left off) and a list of saved seeds. Stored in localStorage; if storage is
// unavailable (private mode, blocked) everything still works, just unsaved.
const LAST = 'seedscape:last', SAVED = 'seedscape:saved', MAX = 200;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export const lastView = () => read(LAST, null);
export const rememberView = (hash) => write(LAST, hash);

// [{ id, name, seed, version, hash, saved }], newest first.
export const savedSeeds = () => read(SAVED, []).filter((s) => s && typeof s.hash === 'string');
export function saveSeed(entry) {
  const list = savedSeeds().filter((s) => s.id !== entry.id);
  write(SAVED, [entry, ...list].slice(0, MAX));
}
export function removeSeed(id) { write(SAVED, savedSeeds().filter((s) => s.id !== id)); }
export function renameSeed(id, name) {
  write(SAVED, savedSeeds().map((s) => (s.id === id ? { ...s, name } : s)));
}
