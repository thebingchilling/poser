import { logError, readErrorLog } from '@poser/platform';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Without this, an error while rendering unmounts the whole app and leaves a
 * blank page. Shows what went wrong instead, so it can be reported.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    logError(error, `render${info.componentStack ? `: ${info.componentStack.trim().split('\n')[0]}` : ''}`);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const report = [
      `${error.name}: ${error.message}`,
      ...(error.stack ?? '').split('\n').slice(1, 6),
      '',
      ...readErrorLog().slice(-5).map((e) => `${new Date(e.time).toISOString()} ${e.message}${e.source ? ` [${e.source}]` : ''}`),
      '',
      `Browser: ${navigator.userAgent}`,
    ].join('\n');
    return (
      <main className="gate">
        <div className="gate__card" style={{ width: 'min(640px, 100%)' }}>
          <h1 className="gate__title">Poser hit an error</h1>
          <p>Your work is autosaved. Reload to continue; if this keeps happening, send the text below to Claude.</p>
          <pre className="error-log" style={{ userSelect: 'all' }}>{report}</pre>
          <div className="gate__actions">
            <button type="button" className="md-button md-button--filled md-state" onClick={() => location.reload()}>
              <span className="md-button__label">Reload</span>
            </button>
          </div>
        </div>
      </main>
    );
  }
}
