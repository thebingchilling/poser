/** A small local error log (PLAN.md section 3.5) kept in localStorage for debugging. */

const KEY = 'poser.errorLog';
const MAX_ENTRIES = 100;

export interface ErrorLogEntry {
  time: number;
  message: string;
  stack?: string;
  source?: string;
}

type SyncStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readErrorLog(storage: SyncStorage = localStorage): ErrorLogEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as ErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logError(error: unknown, source?: string, storage: SyncStorage = localStorage): void {
  const entry: ErrorLogEntry = {
    time: Date.now(),
    message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };
  if (error instanceof Error && error.stack) entry.stack = error.stack.slice(0, 2000);
  if (source) entry.source = source;
  const log = [...readErrorLog(storage), entry].slice(-MAX_ENTRIES);
  try {
    storage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Storage full; drop the log rather than fail.
  }
}

export function clearErrorLog(storage: SyncStorage = localStorage): void {
  storage.removeItem(KEY);
}

export function installGlobalErrorLogging(): void {
  window.addEventListener('error', (e) => logError(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'unhandledrejection'));
}
