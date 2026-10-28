import type { ProjectStore } from './store';
import { saveProject } from './storage/projects';

export interface AutosaveOptions {
  /** Wait this long after the last edit before saving. */
  debounceMs?: number;
  save?: typeof saveProject;
  onError?: (err: unknown) => void;
  onSaved?: () => void;
}

/**
 * Saves the project shortly after edits stop. Returns a handle to flush
 * pending changes (e.g. on page hide) and to stop autosaving.
 */
export function startAutosave(store: ProjectStore, options: AutosaveOptions = {}) {
  const { debounceMs = 1500, save = saveProject, onError, onSaved } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const { project, revision, savedRevision } = store.getState();
    if (revision === savedRevision) return saving;
    saving = saving
      .then(() => save(project))
      .then(() => {
        store.getState().markSaved(revision);
        onSaved?.();
      })
      .catch((err) => onError?.(err));
    return saving;
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.revision === prev.revision || state.revision === state.savedRevision) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  });

  return {
    flush,
    stop() {
      unsubscribe();
      if (timer) clearTimeout(timer);
    },
  };
}
