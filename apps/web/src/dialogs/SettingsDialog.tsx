import { kvDelete, kvGet, kvSet, requestPersistentStorage, storageInfo, type QualityLevel, type StorageInfo } from '@poser/core';
import {
  QUALITY_LABELS,
  QUALITY_SETTINGS,
  backupFolderSupported,
  backupPermission,
  canPromptInstall,
  chooseBackupFolder,
  clearErrorLog,
  currentBrowser,
  forgetBackupFolder,
  getBackupFolder,
  isInstalled,
  onInstallAvailabilityChange,
  promptInstall,
  readErrorLog,
  writeBackup,
  type LockRecord,
} from '@poser/platform';
import { Button, Dialog, Divider, ListSubheader, SegmentedButtons, Slider, Switch, Tabs, useSnackbar } from '@poser/ui';
import { useEffect, useState, type ReactNode } from 'react';
import { exportProjectFile } from '../actions';
import { SetLockDialog } from '../boot/FirstRunLock';
import { runQualityDetection } from '../boot/qualityDetection';
import { memoryManager } from '../platformServices';
import { currentProject } from '../state/project';
import { useSettings } from '../state/settings';
import { useEffectiveQuality, useUi } from '../state/ui';

export const LOCK_KEY = 'appLock';

/** Prototype pages (PLAN.md section 23); 2, 4, 5, and 6 need WebGPU. */
const PROTOTYPES: [string, string][] = [
  ['ragdoll', '1 · Ragdoll Settle'],
  ['cloth', '2 · GPU cloth'],
  ['cut', '3 · Anatomy fit and cut'],
  ['fluids', '4 · Fluids'],
  ['rope', '5 · Rope on a limb'],
  ['channel', '6 · Insertion channel'],
];

const SEEDS = ['#8e4e6b', '#6750a4', '#3f6a8a', '#4f6b3a', '#8a5a2b', '#5f5f5f'];

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <span className="settings-row__label">{label}</span>
      <span className="settings-row__value">{children}</span>
    </div>
  );
}

function AppearanceTab() {
  const s = useSettings();
  return (
    <>
      <ListSubheader>Theme</ListSubheader>
      <SegmentedButtons
        label="Theme"
        value={s.themeMode}
        onChange={(m) => s.set({ themeMode: m })}
        segments={[
          { value: 'dark', label: 'Dark', icon: 'dark_mode' },
          { value: 'light', label: 'Light', icon: 'light_mode' },
        ]}
      />
      <ListSubheader>Color</ListSubheader>
      <div className="swatches" role="radiogroup" aria-label="Theme color">
        {SEEDS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={s.seedColor === c} aria-label={`Color ${c}`} className="swatch" style={{ background: c }} onClick={() => s.set({ seedColor: c })} />
        ))}
        <label className="swatch-custom">
          <input type="color" value={s.seedColor} onChange={(e) => s.set({ seedColor: e.target.value })} />
          <span>Custom color</span>
        </label>
      </div>
      <p className="hint">The 3D view always stays neutral grey so the theme color never tints skin or lighting.</p>
    </>
  );
}

function QualityTab() {
  const s = useSettings();
  const effective = useEffectiveQuality();
  const qualityDrop = useUi((u) => u.qualityDrop);
  const snackbar = useSnackbar();
  const [running, setRunning] = useState(false);
  const rerun = async () => {
    setRunning(true);
    try {
      const r = await runQualityDetection();
      snackbar(`Detected: ${QUALITY_LABELS[r.level]}${r.benchmarkMs !== null ? ` (${r.benchmarkMs.toFixed(1)} ms benchmark)` : ''}`);
    } catch (e) {
      snackbar(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  const levels: QualityLevel[] = ['low', 'medium', 'high', 'full'];
  return (
    <>
      <ListSubheader>Quality level</ListSubheader>
      <SegmentedButtons
        label="Quality level"
        value={s.qualityOverride ?? 'auto'}
        onChange={(v) => {
          s.set({ qualityOverride: v === 'auto' ? null : (v as QualityLevel) });
          useUi.getState().set({ qualityDrop: 0 });
        }}
        segments={[{ value: 'auto', label: 'Auto' }, ...levels.map((l) => ({ value: l, label: QUALITY_LABELS[l] }))]}
      />
      <Row label="In use now">
        {QUALITY_LABELS[effective]}
        {qualityDrop > 0 ? ` (lowered ${qualityDrop} step${qualityDrop > 1 ? 's' : ''} this session)` : ''}
      </Row>
      <Row label="Detected for this device">{s.detectedQuality ? QUALITY_LABELS[s.detectedQuality] : 'Not yet'}</Row>
      {s.capableQuality && s.detectedQuality && s.capableQuality !== s.detectedQuality && (
        <p className="hint">This device seems able to handle {QUALITY_LABELS[s.capableQuality]}. Phones and tablets start lower to stay cool and avoid crashes; you can raise it.</p>
      )}
      <Button variant="tonal" icon="speed" onClick={rerun} disabled={running}>
        {running ? 'Measuring…' : 'Re-run GPU detection'}
      </Button>
      <Divider />
      <Switch
        label="Adaptive quality"
        supporting="Lower detail automatically when frames get slow, and raise it again when there's headroom"
        checked={s.adaptiveQuality}
        onChange={(v) => s.set({ adaptiveQuality: v })}
      />
      <Row label="Render resolution">{Math.round(QUALITY_SETTINGS[effective].pixelRatioScale * 100)}%</Row>
      <Row label="Shadows">{QUALITY_SETTINGS[effective].shadows ? `On (${QUALITY_SETTINGS[effective].shadowMapSize} px)` : 'Off'}</Row>
    </>
  );
}

function PrivacyTab() {
  const s = useSettings();
  const [hasLock, setHasLock] = useState<boolean | null>(null);
  const [setting, setSetting] = useState(false);
  const snackbar = useSnackbar();
  useEffect(() => {
    kvGet<LockRecord>(LOCK_KEY).then((r) => setHasLock(!!r));
  }, []);
  return (
    <>
      <ListSubheader>App lock</ListSubheader>
      <Row label="Status">{hasLock === null ? '…' : hasLock ? 'On' : 'Off'}</Row>
      <div className="button-wrap">
        <Button variant="tonal" icon="lock" onClick={() => setSetting(true)}>
          {hasLock ? 'Change PIN or passphrase' : 'Set a lock'}
        </Button>
        {hasLock && (
          <Button
            variant="text"
            icon="lock_open"
            onClick={async () => {
              await kvDelete(LOCK_KEY);
              setHasLock(false);
              snackbar('App lock removed');
            }}
          >
            Remove lock
          </Button>
        )}
        {hasLock && (
          <Button variant="text" icon="lock" onClick={() => useUi.getState().set({ locked: true, settingsOpen: false })}>
            Lock now
          </Button>
        )}
      </div>
      <Slider
        label="Lock after this long in the background"
        unit="min"
        value={s.autoLockMinutes}
        min={0}
        max={60}
        step={1}
        format={(v) => (v === 0 ? 'Never' : String(v))}
        onChange={(v) => s.set({ autoLockMinutes: v })}
        disabled={!hasLock}
      />
      <Divider />
      <Switch label="Neutral tab" supporting={'Show a plain "Notes" title and icon in the browser tab'} checked={s.neutralTab} onChange={(v) => s.set({ neutralTab: v })} />
      <Switch
        label="Graphic content"
        supporting="Blood, open wounds, removed body parts, and bodily fluids. Separate from nudity."
        checked={s.graphicContent}
        onChange={(v) => s.set({ graphicContent: v })}
      />
      <SetLockDialog
        open={setting}
        onDone={async (record) => {
          setSetting(false);
          if (record) {
            await kvSet(LOCK_KEY, record);
            setHasLock(true);
            snackbar('App lock set');
          }
        }}
      />
    </>
  );
}

function StorageTab() {
  const s = useSettings();
  const snackbar = useSnackbar();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const refresh = () => {
    storageInfo().then(setInfo, () => setInfo(null));
    getBackupFolder().then(setFolder, () => setFolder(null));
  };
  useEffect(refresh, []);
  const fail = (e: unknown) => snackbar(e instanceof Error ? e.message : String(e));
  const backupNow = async () => {
    if (!folder) return;
    if ((await backupPermission(folder, true)) !== 'granted') return snackbar('Permission to the backup folder was not given');
    const name = await writeBackup(folder, currentProject());
    snackbar(`Backed up as ${name}`);
  };
  return (
    <>
      <ListSubheader>On this device</ListSubheader>
      <Row label="Used">{info ? `${formatBytes(info.usage)} of ${formatBytes(info.quota)}` : '…'}</Row>
      <Row label="Protected from clearing">{info ? (info.persisted ? 'Yes' : 'No') : '…'}</Row>
      {info && !info.persisted && (
        <Button variant="tonal" icon="storage" onClick={() => requestPersistentStorage().then((ok) => (snackbar(ok ? 'Storage is now protected' : 'The browser declined. Installing the app usually helps.'), refresh()))}>
          Protect storage
        </Button>
      )}
      <Row label="Graphics memory (estimate)">
        {formatBytes(memoryManager.used)} of {formatBytes(memoryManager.budget)}
      </Row>
      <ListSubheader>Backups</ListSubheader>
      {backupFolderSupported() ? (
        <>
          <Row label="Backup folder">{folder ? folder.name : 'None'}</Row>
          <div className="button-wrap">
            <Button variant="tonal" icon="folder_open" onClick={() => chooseBackupFolder().then(setFolder, (e: Error) => e.name !== 'AbortError' && fail(e))}>
              {folder ? 'Change folder' : 'Choose folder'}
            </Button>
            {folder && <Button variant="tonal" icon="backup" onClick={() => backupNow().catch(fail)}>Back up now</Button>}
            {folder && <Button variant="text" icon="delete" onClick={() => forgetBackupFolder().then(refresh)}>Stop backing up</Button>}
          </div>
          <Switch label="Back up automatically" supporting="Writes a .poser file to the folder after you make changes; keeps the 10 newest per project" checked={s.autoBackup} onChange={(v) => s.set({ autoBackup: v })} disabled={!folder} />
        </>
      ) : (
        <p className="hint">Automatic backup folders need desktop Chrome. On this device, export .poser files instead.</p>
      )}
      <Button variant="text" icon="download" onClick={exportProjectFile}>Export this project now</Button>
    </>
  );
}

function InstallTab() {
  const [, force] = useState(0);
  useEffect(() => onInstallAvailabilityChange(() => force((n) => n + 1)), []);
  const browser = currentBrowser();
  if (isInstalled()) return <p>Poser is installed on this device.</p>;
  return (
    <>
      <p>Installing Poser gives it its own window and icon, and stops the browser from clearing its storage. It still needs an internet connection to open.</p>
      {canPromptInstall() ? (
        <Button icon="install_desktop" onClick={() => void promptInstall()}>Install Poser</Button>
      ) : browser.isIOS ? (
        <p>On iPhone or iPad: tap the Share button, then Add to Home Screen.</p>
      ) : (
        <p>Use Chrome's menu, then Install Poser (or Add to Home screen on Android).</p>
      )}
    </>
  );
}

function DiagnosticsTab() {
  const ui = useUi();
  const s = useSettings();
  const [log, setLog] = useState(readErrorLog());
  const browser = currentBrowser();
  const gpu = ui.gpu;
  return (
    <>
      <ListSubheader>Graphics</ListSubheader>
      <Row label="Renderer">{ui.backend === 'webgpu' ? 'WebGPU' : ui.backend === 'webgl2' ? 'WebGL2 (compatibility mode)' : 'Starting…'}</Row>
      {ui.webgpuFailure && <Row label="WebGPU failed this session">{ui.webgpuFailure}</Row>}
      <Row label="WebGPU">{gpu ? (gpu.webgpu ? 'Available' : `Not available: ${gpu.unavailableReason}`) : '…'}</Row>
      {gpu?.webgpu && (
        <>
          <Row label="GPU">{[gpu.vendor, gpu.architecture, gpu.description].filter(Boolean).join(' · ') || 'Not reported'}</Row>
          <Row label="Max buffer size">{gpu.maxBufferSizeMB?.toFixed(0)} MB</Row>
          {gpu.isFallbackAdapter && <Row label="Note">Software (fallback) adapter: expect low performance</Row>}
        </>
      )}
      <Switch
        label="Compatibility mode"
        supporting="Always use the WebGL2 renderer. Simulations are off. For testing or devices with GPU problems."
        checked={s.forceCompatibility}
        onChange={(v) => s.set({ forceCompatibility: v })}
      />
      <Row label="Device memory">{gpu?.deviceMemoryGB ? `${gpu.deviceMemoryGB} GB or more` : 'Not reported'}</Row>
      <Row label="Benchmark">{s.benchmarkMs !== null ? `${s.benchmarkMs.toFixed(1)} ms` : 'Not run'}</Row>
      <ListSubheader>Browser</ListSubheader>
      <Row label="Browser">{browser.name}{browser.isIOS ? ' (Safari engine)' : ''}</Row>
      <Row label="Installed as app">{isInstalled() ? 'Yes' : 'No'}</Row>
      <Row label="Cross-origin isolated">{self.crossOriginIsolated ? 'Yes' : 'No'}</Row>
      <Row label="Safe Mode">{ui.safeMode ? 'On' : 'Off'}</Row>
      <ListSubheader>Prototypes</ListSubheader>
      <p className="hint">Throwaway tests of the riskiest technology (PLAN.md section 23). Try them on each device.</p>
      <div className="button-wrap">
        {PROTOTYPES.map(([file, label]) => (
          <Button key={file} variant="tonal" icon="science" onClick={() => window.open(`/prototypes/${file}.html`, '_blank')}>
            {label}
          </Button>
        ))}
      </div>
      <ListSubheader>Error log</ListSubheader>
      {log.length === 0 ? (
        <p className="hint">No errors recorded.</p>
      ) : (
        <>
          <pre className="error-log">{log.slice(-20).reverse().map((e) => `${new Date(e.time).toLocaleString()}  ${e.message}${e.source ? `  [${e.source}]` : ''}`).join('\n')}</pre>
          <Button variant="text" icon="delete" onClick={() => (clearErrorLog(), setLog([]))}>Clear log</Button>
        </>
      )}
    </>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const tab = useUi((s) => s.settingsTab);
  const set = useUi((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ settingsOpen: o })} title="Settings" large actions={<Button onClick={() => set({ settingsOpen: false })}>Done</Button>}>
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={(t) => set({ settingsTab: t })}
        tabs={[
          { value: 'appearance', label: 'Appearance', icon: 'palette', content: <AppearanceTab /> },
          { value: 'quality', label: 'Quality', icon: 'speed', content: <QualityTab /> },
          { value: 'privacy', label: 'Privacy', icon: 'shield_lock', content: <PrivacyTab /> },
          { value: 'storage', label: 'Storage', icon: 'storage', content: <StorageTab /> },
          { value: 'install', label: 'Install', icon: 'install_desktop', content: <InstallTab /> },
          { value: 'diagnostics', label: 'Diagnostics', icon: 'bug_report', content: <DiagnosticsTab /> },
        ]}
      />
    </Dialog>
  );
}
