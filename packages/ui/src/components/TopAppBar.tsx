import type { ReactNode } from 'react';

export function TopAppBar({ leading, title, actions }: { leading?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="md-top-app-bar">
      {leading && <div className="md-top-app-bar__leading">{leading}</div>}
      <h1 className="md-top-app-bar__title">{title}</h1>
      {actions && <div className="md-top-app-bar__actions">{actions}</div>}
    </header>
  );
}
