import { createProject, kvGet, kvSet, loadLastProject, requestPersistentStorage, saveProject, startAutosave } from '@poser/core';
import {
  backupPermission,
  currentBrowser,
  detectGpu,
  getBackupFolder,
  QUALITY_LABELS,
  logError,
  setNeutralTab,
  writeBackup,
  type CrashCheck,
  type LockRecord,
} from '@poser/platform';
import { SnackbarProvider, TooltipProvider, applyTheme, useSnackbar } from '@poser/ui';
import { useEffect, useState } from 'react';
import { AdultsNotice, LockScreen, UnsupportedBrowser } from './boot/Gates';
import { SetLockDialog } from './boot/FirstRunLock';
import { runQualityDetection } from './boot/qualityDetection';
import { SafeModeDialog, type SafeModeChoice } from './boot/SafeModeDialog';
import { LOCK_KEY } from './dialogs/SettingsDialog';
import { crashGuard } from './platformServices';
import { AppShell } from './shell/AppShell';
import { projectStore } from './state/project';
import { useSettings } from './state/settings';
import { useUi } from './state/ui';

/** Theme and neutral tab follow the settings. */
function useAppearance() {
  const themeMode = useSettings((s) => s.themeMode);
  const seed = useSettings((s) => s.seedColor);
  const neutral = useSettings((s) => s.neutralTab);
  const projectName = useProjectName();
  useEffect(() => applyTheme({ seed, mode: themeMode }), [seed, themeMode]);
  useEffect(() => setNeutralTab(neutral, `${projectName} · Poser`), [neutral, projectName]);
}

function useProjectName() {
  const [name, setName] = useState(projectStore.getState().project.name);
  useEffect(() => projectStore.subscribe((s) => setName(s.project.name)), []);
  return name;
}

/** Re-lock after time in the background (PLAN.md section 16.6). */
function useAutoLock(lock: LockRecord | null) {
  const minutes = useSettings((s) => s.autoLockMinutes);
  useEffect(() => {
    if (!lock || minutes <= 0) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= minutes * 60_000) useUi.getState().set({ locked: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lock, minutes]);
}

/** Autosave to IndexedDB, plus the automatic backup folder (PLAN.md section 16.7). */
function usePersistence(ready: boolean) {
  const snackbar = useSnackbar();
  useEffect(() => {
    if (!ready) return;
    let lastBackup = 0;
    const autosave = startAutosave(projectStore, {
      onError: (err) => {
        logError(err, 'autosave');
        snackbar('Autosave failed. Export a .poser file to be safe.');
      },
      onSaved: async () => {
        // Backups at most every 2 minutes; only when permission is still granted
        // (re-granting needs a click, which Settings › Storage offers).
        if (!useSettings.getState().autoBackup || Date.now() - lastBackup < 120_000) return;
        try {
          const folder = await getBackupFolder();
          if (!folder || (await backupPermission(folder)) !== 'granted') return;
          lastBackup = Date.now();
          await writeBackup(folder, projectStore.getState().project);
        } catch (err) {
          logError(err, 'backup');
        }
      },
    });
    const flush = () => void autosave.flush();
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      autosave.stop();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [ready, snackbar]);
}

type Stage = 'browser' | 'adults' | 'lock' | 'safe-mode' | 'loading' | 'ready';

function Main({ crash }: { crash: CrashCheck }) {
  const settings = useSettings();
  const locked = useUi((s) => s.locked);
  const snackbar = useSnackbar();
  const [stage, setStage] = useState<Stage>('browser');
  const [browserOverride, setBrowserOverride] = useState(false);
  const [lock, setLock] = useState<LockRecord | null | undefined>(undefined);
  const [offerLock, setOfferLock] = useState(false);
  const browser = currentBrowser();
  useAppearance();
  useAutoLock(lock ?? null);
  usePersistence(stage === 'ready');

  useEffect(() => {
    kvGet<LockRecord>(LOCK_KEY).then(
      (r) => {
        setLock(r ?? null);
        if (r) useUi.getState().set({ locked: true });
      },
      () => setLock(null),
    );
    detectGpu().then((gpu) => useUi.getState().set({ gpu }));
  }, []);

  // Walk through the startup gates in order.
  useEffect(() => {
    if (lock === undefined) return;
    if (stage === 'browser' && (browser.isChrome || browserOverride)) setStage('adults');
    else if (stage === 'adults' && settings.adultsConfirmed) setStage('lock');
    else if (stage === 'lock' && !locked) setStage(crash.crashed ? 'safe-mode' : 'loading');
  }, [stage, browser.isChrome, browserOverride, settings.adultsConfirmed, locked, lock, crash.crashed]);

  const load = async (choice: SafeModeChoice | 'normal') => {
    setStage('loading');
    if (choice === 'last-low') useUi.getState().set({ safeMode: true });
    try {
      const project =
        choice === 'empty' ? null : await crashGuard.guard('Opening the last project', () => loadLastProject());
      const p = project ?? createProject();
      projectStore.getState().load(p);
      if (!project) await saveProject(p);
    } catch (err) {
      logError(err, 'startup');
      snackbar('The last project could not be opened. Started a new one.');
      projectStore.getState().load(createProject());
    }
    setStage('ready');
    if (choice !== 'normal') crashGuard.clearCrashCount();
    void requestPersistentStorage();
    if (!useSettings.getState().firstRunDone) {
      useSettings.getState().set({ firstRunDone: true });
      if (lock === null) setOfferLock(true);
    }
    // First run on this device: measure the GPU in the background.
    if (useSettings.getState().detectedQuality === null && choice === 'normal') {
      runQualityDetection().then(
        ({ level, capable }) => {
          const extra = capable !== level ? ` This device could handle ${QUALITY_LABELS[capable]}; you can raise it in Settings.` : '';
          snackbar({ text: `Quality set to ${QUALITY_LABELS[level]} for this device.${extra}`, duration: 7000 });
        },
        (err) => logError(err, 'quality detection'),
      );
    }
  };

  useEffect(() => {
    if (stage === 'loading' && !crash.crashed) void load('normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (stage === 'browser') return lock === undefined ? null : <UnsupportedBrowser browser={browser} onContinue={() => setBrowserOverride(true)} />;
  if (stage === 'adults') return <AdultsNotice onConfirm={() => settings.set({ adultsConfirmed: true })} />;
  const lockScreen = locked && lock ? <LockScreen record={lock} onUnlock={() => useUi.getState().set({ locked: false })} /> : null;
  if (lockScreen && stage !== 'ready') return lockScreen;
  if (stage === 'safe-mode') return <SafeModeDialog task={crash.task} crashCount={crash.crashCount} onChoose={(c) => void load(c)} />;
  if (stage !== 'ready') return <div className="splash" aria-busy="true">Loading…</div>;
  return (
    <>
      <div className="app-root" inert={!!lockScreen || undefined} aria-hidden={!!lockScreen || undefined}>
        <AppShell />
      </div>
      {lockScreen}
      <SetLockDialog
        open={offerLock}
        firstRun
        onDone={async (record) => {
          setOfferLock(false);
          if (record) {
            await kvSet(LOCK_KEY, record);
            setLock(record);
            snackbar('App lock set');
          }
        }}
      />
    </>
  );
}

export function App({ crash }: { crash: CrashCheck }) {
  return (
    <TooltipProvider>
      <SnackbarProvider>
        <Main crash={crash} />
      </SnackbarProvider>
    </TooltipProvider>
  );
}
