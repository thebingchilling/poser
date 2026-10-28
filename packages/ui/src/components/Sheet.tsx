import type { ReactNode } from 'react';
import { IconButton } from './Button';

interface SheetProps {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Standard side sheet (docked beside the viewport on wide windows). */
export function SideSheet({ title, onClose, children, actions, className }: SheetProps) {
  return (
    <section className={`md-side-sheet${className ? ' ' + className : ''}`} aria-label={title}>
      <header className="md-sheet__header">
        <h2 className="md-sheet__title">{title}</h2>
        {onClose && <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />}
      </header>
      <div className="md-sheet__content md-scroll">{children}</div>
      {actions && <footer className="md-sheet__actions">{actions}</footer>}
    </section>
  );
}

/** Standard bottom sheet (phones); sits over the bottom of the viewport. */
export function BottomSheet({ title, onClose, children, actions, className }: SheetProps) {
  return (
    <section className={`md-bottom-sheet${className ? ' ' + className : ''}`} aria-label={title}>
      <div className="md-bottom-sheet__handle" aria-hidden="true" />
      <header className="md-sheet__header">
        <h2 className="md-sheet__title">{title}</h2>
        {onClose && <IconButton icon="close" label={`Close ${title}`} onClick={onClose} />}
      </header>
      <div className="md-sheet__content md-scroll">{children}</div>
      {actions && <footer className="md-sheet__actions">{actions}</footer>}
    </section>
  );
}
