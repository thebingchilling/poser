/**
 * Safe Mode after a crash (PLAN.md section 3.5). A "loading started" flag is
 * written before heavy work and cleared when it finishes; if the next launch
 * still finds it, the tab died mid-load (e.g. the iOS memory limit) and the
 * app starts in Safe Mode. Uses localStorage because it is synchronous and
 * survives a killed tab.
 */

const FLAG_KEY = 'poser.loadingStarted';
const CRASH_COUNT_KEY = 'poser.crashCount';

type SyncStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface CrashCheck {
  /** The previous session died while loading. */
  crashed: boolean;
  /** What it was loading when it died. */
  task: string | null;
  /** Consecutive crashed launches. */
  crashCount: number;
}

export class CrashGuard {
  constructor(private readonly storage: SyncStorage) {}

  /** Call once at startup, before anything heavy. */
  check(): CrashCheck {
    const raw = this.storage.getItem(FLAG_KEY);
    const previous = Number(this.storage.getItem(CRASH_COUNT_KEY) ?? 0) || 0;
    if (raw === null) {
      this.storage.removeItem(CRASH_COUNT_KEY);
      return { crashed: false, task: null, crashCount: 0 };
    }
    const crashCount = previous + 1;
    this.storage.setItem(CRASH_COUNT_KEY, String(crashCount));
    this.storage.removeItem(FLAG_KEY);
    let task: string | null = null;
    try {
      task = (JSON.parse(raw) as { task?: string }).task ?? null;
    } catch {
      // Older or corrupt flag; still counts as a crash.
    }
    return { crashed: true, task, crashCount };
  }

  /** Mark the start of heavy work. Returns a function that marks it finished. */
  begin(task: string): () => void {
    this.storage.setItem(FLAG_KEY, JSON.stringify({ task, at: Date.now() }));
    return () => this.storage.removeItem(FLAG_KEY);
  }

  async guard<T>(task: string, work: () => Promise<T>): Promise<T> {
    const done = this.begin(task);
    try {
      return await work();
    } finally {
      done();
    }
  }

  /** The user got through Safe Mode successfully. */
  clearCrashCount(): void {
    this.storage.removeItem(CRASH_COUNT_KEY);
  }
}
