/**
 * Snapshot-based undo/redo. The project is an immutable tree (edited through
 * immer), so each entry just keeps the before/after roots and unchanged
 * branches are shared between them. Heavy asset data lives outside the
 * project (OPFS), so snapshots stay small.
 */

export interface HistoryEntry<T> {
  label: string;
  before: T;
  after: T;
  /** Consecutive edits with the same key merge into one entry (slider drags). */
  coalesceKey?: string;
  time: number;
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
}

export const HISTORY_LIMIT = 200;
/** Edits with the same coalesce key closer together than this merge. */
export const COALESCE_WINDOW_MS = 1000;

export function emptyHistory<T>(): HistoryState<T> {
  return { past: [], future: [] };
}

export function record<T>(
  history: HistoryState<T>,
  label: string,
  before: T,
  after: T,
  options: { coalesceKey?: string; now?: number } = {},
): HistoryState<T> {
  const now = options.now ?? Date.now();
  const last = history.past[history.past.length - 1];
  if (
    last &&
    options.coalesceKey !== undefined &&
    last.coalesceKey === options.coalesceKey &&
    now - last.time < COALESCE_WINDOW_MS
  ) {
    const merged: HistoryEntry<T> = { ...last, after, time: now };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const entry: HistoryEntry<T> = { label, before, after, time: now };
  if (options.coalesceKey !== undefined) entry.coalesceKey = options.coalesceKey;
  const past = [...history.past, entry];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export function undo<T>(history: HistoryState<T>): { history: HistoryState<T>; value: T; label: string } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    value: entry.before,
    label: entry.label,
  };
}

export function redo<T>(history: HistoryState<T>): { history: HistoryState<T>; value: T; label: string } | null {
  const entry = history.future[0];
  if (!entry) return null;
  // A redone entry must not merge with the next edit.
  const { coalesceKey: _drop, ...rest } = entry;
  return {
    history: { past: [...history.past, rest], future: history.future.slice(1) },
    value: entry.after,
    label: entry.label,
  };
}
