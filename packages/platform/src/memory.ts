/**
 * Memory manager (PLAN.md section 3.5): systems register what they put on the
 * GPU, and the manager reports usage against the quality level's budget,
 * suggests what to unload first, and warns before the browser would kill the
 * tab. Browsers don't expose real GPU memory use, so this is an estimate.
 */

export type MemoryPriority = 'visible' | 'hidden' | 'cache';

interface Allocation {
  bytes: number;
  priority: MemoryPriority;
  lastUsed: number;
}

export type MemoryStatus = 'ok' | 'warning' | 'over';

export class MemoryManager {
  private allocations = new Map<string, Allocation>();
  private listeners = new Set<(status: MemoryStatus) => void>();
  private lastStatus: MemoryStatus = 'ok';

  constructor(private budgetBytes: number, private readonly warnFraction = 0.85) {}

  setBudget(bytes: number): void {
    this.budgetBytes = bytes;
    this.emit();
  }

  get budget(): number {
    return this.budgetBytes;
  }

  track(key: string, bytes: number, priority: MemoryPriority = 'visible', now = Date.now()): void {
    this.allocations.set(key, { bytes, priority, lastUsed: now });
    this.emit();
  }

  touch(key: string, now = Date.now()): void {
    const a = this.allocations.get(key);
    if (a) a.lastUsed = now;
  }

  setPriority(key: string, priority: MemoryPriority): void {
    const a = this.allocations.get(key);
    if (a) a.priority = priority;
  }

  release(key: string): void {
    if (this.allocations.delete(key)) this.emit();
  }

  get used(): number {
    let total = 0;
    for (const a of this.allocations.values()) total += a.bytes;
    return total;
  }

  status(): MemoryStatus {
    const used = this.used;
    if (used > this.budgetBytes) return 'over';
    if (used > this.budgetBytes * this.warnFraction) return 'warning';
    return 'ok';
  }

  /**
   * Keys to unload to get back under the warning line: caches first, then
   * hidden items, least recently used first. Visible items are never chosen.
   */
  evictionCandidates(): string[] {
    const target = this.budgetBytes * this.warnFraction;
    let used = this.used;
    if (used <= target) return [];
    const rank: Record<MemoryPriority, number> = { cache: 0, hidden: 1, visible: 2 };
    const candidates = [...this.allocations.entries()]
      .filter(([, a]) => a.priority !== 'visible')
      .sort(([, a], [, b]) => rank[a.priority] - rank[b.priority] || a.lastUsed - b.lastUsed);
    const out: string[] = [];
    for (const [key, a] of candidates) {
      if (used <= target) break;
      out.push(key);
      used -= a.bytes;
    }
    return out;
  }

  onStatusChange(listener: (status: MemoryStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const status = this.status();
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    for (const l of this.listeners) l(status);
  }
}
