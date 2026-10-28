import { describe, expect, it } from 'vitest';
import { activeScene, createProject } from './factory';
import { createProjectStore } from './store';

describe('project store', () => {
  it('records undoable edits', () => {
    const store = createProjectStore(createProject('Test'));
    store.getState().edit('Rename', (p) => {
      p.name = 'Renamed';
    });
    expect(store.getState().project.name).toBe('Renamed');
    expect(store.getState().revision).toBe(1);
    expect(store.getState().undo()).toBe('Rename');
    expect(store.getState().project.name).toBe('Test');
    store.getState().redo();
    expect(store.getState().project.name).toBe('Renamed');
  });

  it('ignores no-op edits', () => {
    const store = createProjectStore();
    store.getState().edit('Nothing', () => {});
    expect(store.getState().revision).toBe(0);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('shares unchanged branches between snapshots', () => {
    const store = createProjectStore();
    const before = store.getState().project;
    store.getState().edit('Hide floor', (p) => {
      p.scenes[0]!.environment.floor = false;
    });
    const after = store.getState().project;
    expect(activeScene(after).lights).toBe(activeScene(before).lights);
  });

  it('load clears history and counts as saved', () => {
    const store = createProjectStore();
    store.getState().edit('x', (p) => {
      p.name = 'x';
    });
    store.getState().load(createProject('Other'));
    const s = store.getState();
    expect(s.history.past).toHaveLength(0);
    expect(s.revision).toBe(s.savedRevision);
  });
});
