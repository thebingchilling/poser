import '@poser/ui/styles.css';
import './app.css';
import { initInstallPrompt, installGlobalErrorLogging, removeServiceWorkers, setNeutralTab } from '@poser/platform';
import { applyTheme } from '@poser/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { crashGuard } from './platformServices';
import { useSettings } from './state/settings';

installGlobalErrorLogging();
initInstallPrompt();

// Apply appearance before the first paint.
const settings = useSettings.getState();
applyTheme({ seed: settings.seedColor, mode: settings.themeMode });
if (settings.neutralTab) setNeutralTab(true);

const crash = crashGuard.check();

// No offline caching; clear out the caching worker earlier versions installed.
void removeServiceWorkers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App crash={crash} />
    </ErrorBoundary>
  </StrictMode>,
);
