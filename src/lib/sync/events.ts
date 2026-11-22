/** Tiny event bus so the repository can tell the sync engine about local changes without importing it. */
const listeners = new Set<() => void>();

export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyLocalChange(): void {
  for (const fn of listeners) fn();
}
