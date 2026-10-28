import { describe, expect, it } from 'vitest';
import { COALESCE_WINDOW_MS, HISTORY_LIMIT, emptyHistory, record, redo, undo } from './history';

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = emptyHistory<number>();
    h = record(h, 'a', 0, 1, { now: 0 });
    h = record(h, 'b', 1, 2, { now: 10 });
    const u1 = undo(h)!;
    expect(u1.value).toBe(1);
    expect(u1.label).toBe('b');
    const u2 = undo(u1.history)!;
    expect(u2.value).toBe(0);
    expect(undo(u2.history)).toBeNull();
    const r1 = redo(u2.history)!;
    expect(r1.value).toBe(1);
    expect(redo(r1.history)!.value).toBe(2);
  });

  it('clears redo on a new edit', () => {
    let h = record(emptyHistory<number>(), 'a', 0, 1, { now: 0 });
    h = undo(h)!.history;
    h = record(h, 'c', 0, 5, { now: 1 });
    expect(redo(h)).toBeNull();
  });

  it('coalesces edits with the same key inside the window', () => {
    let h = emptyHistory<number>();
    h = record(h, 'slide', 0, 1, { coalesceKey: 'k', now: 0 });
    h = record(h, 'slide', 1, 2, { coalesceKey: 'k', now: 100 });
    h = record(h, 'slide', 2, 3, { coalesceKey: 'k', now: 200 });
    expect(h.past).toHaveLength(1);
    expect(undo(h)!.value).toBe(0);
    h = record(h, 'slide', 3, 4, { coalesceKey: 'k', now: 200 + COALESCE_WINDOW_MS });
    expect(h.past).toHaveLength(2);
  });

  it('does not coalesce into a redone entry', () => {
    let h = record(emptyHistory<number>(), 's', 0, 1, { coalesceKey: 'k', now: 0 });
    h = redo(undo(h)!.history)!.history;
    h = record(h, 's', 1, 2, { coalesceKey: 'k', now: 1 });
    expect(h.past).toHaveLength(2);
  });

  it('caps history length', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, 'x', i, i + 1, { now: i * 10_000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]!.before).toBe(10);
  });
});
