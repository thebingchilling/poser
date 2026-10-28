import { describe, expect, it, vi } from 'vitest';
import { startAutosave } from './autosave';
import { createProjectStore } from './store';
import type { Project } from './types';

describe('autosave', () => {
  it('debounces saves and marks the store saved', async () => {
    vi.useFakeTimers();
    const store = createProjectStore();
    const saved: Project[] = [];
    const autosave = startAutosave(store, { debounceMs: 100, save: async (p) => void saved.push(p) });
    store.getState().edit('a', (p) => void (p.name = 'a'));
    store.getState().edit('b', (p) => void (p.name = 'b'));
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(saved.map((p) => p.name)).toEqual(['b']);
    expect(store.getState().savedRevision).toBe(store.getState().revision);
    autosave.stop();
    vi.useRealTimers();
  });

  it('flush saves immediately', async () => {
    const store = createProjectStore();
    const save = vi.fn(async () => {});
    const autosave = startAutosave(store, { debounceMs: 10_000, save });
    store.getState().edit('a', (p) => void (p.name = 'a'));
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    autosave.stop();
  });
});
