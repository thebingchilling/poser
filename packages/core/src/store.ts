import { produce, type Draft } from 'immer';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createProject } from './factory';
import { emptyHistory, record, redo, undo, type HistoryState } from './history';
import type { Project } from './types';

export interface ProjectState {
  project: Project;
  history: HistoryState<Project>;
  /** Increments on every change to `project`, including undo/redo and loads. */
  revision: number;
  /** Revision last written to storage. */
  savedRevision: number;

  /** Apply an undoable edit. */
  edit(label: string, recipe: (draft: Draft<Project>) => void, options?: { coalesceKey?: string }): void;
  undo(): string | null;
  redo(): string | null;
  /** Replace the project (open, new, restore) and clear history. */
  load(project: Project): void;
  markSaved(revision: number): void;
}

export type ProjectStore = StoreApi<ProjectState>;

export function createProjectStore(initial: Project = createProject()): ProjectStore {
  return createStore<ProjectState>()((set, get) => ({
    project: initial,
    history: emptyHistory(),
    revision: 0,
    savedRevision: 0,

    edit(label, recipe, options = {}) {
      const before = get().project;
      const changed = produce(before, recipe);
      if (changed === before) return;
      const after = produce(changed, (draft) => {
        draft.updatedAt = Date.now();
      });
      set((s) => ({
        project: after,
        history: record(s.history, label, before, after, options),
        revision: s.revision + 1,
      }));
    },

    undo() {
      const result = undo(get().history);
      if (!result) return null;
      set((s) => ({ project: result.value, history: result.history, revision: s.revision + 1 }));
      return result.label;
    },

    redo() {
      const result = redo(get().history);
      if (!result) return null;
      set((s) => ({ project: result.value, history: result.history, revision: s.revision + 1 }));
      return result.label;
    },

    load(project) {
      set((s) => ({ project, history: emptyHistory(), revision: s.revision + 1, savedRevision: s.revision + 1 }));
    },

    markSaved(revision) {
      set({ savedRevision: revision });
    },
  }));
}
