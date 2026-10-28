import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './Button';

export interface SnackbarMessage {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms; default 4000, or 8000 with an action. */
  duration?: number;
}

const SnackbarContext = createContext<(msg: SnackbarMessage | string) => void>(() => {});

export function useSnackbar() {
  return useContext(SnackbarContext);
}

/** Shows one MD3 snackbar at a time from a queue. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<(SnackbarMessage & { id: number })[]>([]);
  const nextId = useRef(0);
  const show = useCallback((msg: SnackbarMessage | string) => {
    const m = typeof msg === 'string' ? { text: msg } : msg;
    setQueue((q) => [...q, { ...m, id: nextId.current++ }]);
  }, []);
  const current = queue[0];
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, current.duration ?? (current.actionLabel ? 8000 : 4000));
    return () => clearTimeout(t);
  }, [current, dismiss]);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      <div className="md-snackbar-host" role="status" aria-live="polite">
        {current && (
          <div className="md-snackbar" key={current.id}>
            <span className="md-snackbar__text">{current.text}</span>
            {current.actionLabel && (
              <button
                type="button"
                className="md-snackbar__action md-state"
                onClick={() => {
                  current.onAction?.();
                  dismiss();
                }}
              >
                {current.actionLabel}
              </button>
            )}
            <IconButton icon="close" label="Dismiss" onClick={dismiss} className="md-snackbar__close" />
          </div>
        )}
      </div>
    </SnackbarContext.Provider>
  );
}
