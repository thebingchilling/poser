import {
  AssistChip,
  BottomSheet,
  Button,
  Fab,
  Menu,
  NavigationBar,
  NavigationRail,
  SideSheet,
  StackedAction,
  TopAppBar,
  useSnackbar,
  useWindowSizeClass,
  type MenuEntry,
} from '@poser/ui';
import { useEffect, useState } from 'react';
import {
  addBuiltinFigure,
  captureScreenshot,
  deleteCurrentProject,
  exportProjectFile,
  importProjectFile,
  newProject,
  redo,
  undo,
} from '../actions';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { filesFromDataTransfer } from '../import/collectFiles';
import { ImportWizard } from '../import/ImportWizard';
import { startImport } from '../import/startImport';
import { useProject } from '../state/project';
import { useUi, type WorkspaceId } from '../state/ui';
import { ViewportView, viewportRef } from '../viewport/ViewportView';
import { Inspector } from '../workspaces/Inspector';
import { ModeSwitch, WorkspaceContent } from '../workspaces/Workspaces';
import { ConfirmDialog, OpenProjectDialog, RenameDialog } from './ProjectDialogs';
import { mirrorSelected, togglePinSelected } from '../workspaces/posing';
import { PHONE_PRIMARY, WORKSPACES } from './workspaces';

function useUndoRedo() {
  const snackbar = useSnackbar();
  const canUndo = useProject((s) => s.history.past.length > 0);
  const canRedo = useProject((s) => s.history.future.length > 0);
  const doUndo = () => {
    const label = undo();
    if (label) snackbar({ text: `Undid: ${label}`, actionLabel: 'Redo', onAction: () => void redo(), duration: 3000 });
  };
  const doRedo = () => {
    const label = redo();
    if (label) snackbar({ text: `Redid: ${label}`, duration: 2000 });
  };
  return { canUndo, canRedo, doUndo, doRedo };
}

function useShortcuts(doUndo: () => void, doRedo: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        doRedo();
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'f') {
        viewportRef.current?.frameAll();
      } else if (!mod && e.key.toLowerCase() === 'q') {
        const ui = useUi.getState();
        ui.set({ poseMode: ui.poseMode === 'fk' ? 'ik' : 'fk' });
      } else if (!mod && e.key.toLowerCase() === 'p') {
        togglePinSelected();
      } else if (!mod && e.key.toLowerCase() === 'm') {
        mirrorSelected();
      } else if (e.key === 'Escape') {
        useUi.getState().set({ selectedJoint: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);
}

function ProjectMenu({ compact }: { compact: boolean }) {
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<'open' | 'rename' | 'new' | 'delete' | null>(null);
  const fail = (e: unknown) => snackbar(e instanceof Error ? e.message : String(e));
  const items: MenuEntry[] = [
    { label: 'New project', icon: 'add', onSelect: () => setDialog('new') },
    { label: 'Open…', icon: 'folder_open', onSelect: () => setDialog('open') },
    { label: 'Rename…', icon: 'edit', onSelect: () => setDialog('rename') },
    { kind: 'divider' },
    { label: 'Export .poser file', icon: 'download', onSelect: () => exportProjectFile() },
    { label: 'Import .poser file…', icon: 'upload', onSelect: () => importProjectFile().then((p) => p && snackbar(`Opened ${p.name}`), fail) },
    { kind: 'divider' },
    { label: 'Delete project', icon: 'delete', danger: true, onSelect: () => setDialog('delete') },
  ];
  return (
    <>
      <Menu
        label="Project"
        items={items}
        trigger={compact ? <StackedAction icon="menu">Project</StackedAction> : <Button variant="text" icon="menu">Project</Button>}
      />
      <OpenProjectDialog open={dialog === 'open'} onClose={() => setDialog(null)} />
      <RenameDialog open={dialog === 'rename'} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog === 'new'}
        title="New project?"
        body="The current project is saved automatically and stays in Open…."
        confirmLabel="Create"
        onConfirm={() => newProject().catch(fail)}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete this project?"
        body="It is removed from this device. Backups and exported .poser files are not affected. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteCurrentProject().catch(fail)}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function TextAction(props: Parameters<typeof Button>[0]) {
  return <Button variant="text" {...props} />;
}

function TopBar({ compact }: { compact: boolean }) {
  const projectName = useProject((s) => s.project.name);
  const { canUndo, canRedo, doUndo, doRedo } = useUndoRedo();
  useShortcuts(doUndo, doRedo);
  const snackbar = useSnackbar();
  const openSettings = () => useUi.getState().set({ settingsOpen: true });
  const capture = () => captureScreenshot().then(() => snackbar('Screenshot saved'), (e: Error) => snackbar(e.message));
  const Action = compact ? StackedAction : TextAction;
  return (
    <TopAppBar
      leading={<ProjectMenu compact={compact} />}
      title={projectName}
      actions={
        <>
          <Action icon="undo" onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</Action>
          <Action icon="redo" onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">Redo</Action>
          <Action icon="photo_camera" onClick={capture}>Capture</Action>
          <Action icon="settings" onClick={openSettings}>Settings</Action>
        </>
      }
    />
  );
}

function WorkspaceFab({ workspace }: { workspace: WorkspaceId }) {
  const snackbar = useSnackbar();
  switch (workspace) {
    case 'library':
      return <Fab icon="upload" onClick={() => void startImport(false)}>Import</Fab>;
    case 'scene':
      return (
        <Menu
          label="Add figure"
          items={[
            { label: 'Female figure', icon: 'female', onSelect: () => addBuiltinFigure('builtin:female') },
            { label: 'Male figure', icon: 'male', onSelect: () => addBuiltinFigure('builtin:male') },
          ]}
          trigger={<Fab icon="person_add">Add figure</Fab>}
        />
      );
    case 'pose':
      return <Fab icon="center_focus_strong" onClick={() => viewportRef.current?.frameAll()}>Frame all</Fab>;
    case 'render':
      return <Fab icon="photo_camera" onClick={() => captureScreenshot().then(() => snackbar('Screenshot saved'), (e: Error) => snackbar(e.message))}>Capture</Fab>;
    default:
      return null;
  }
}

function QuickBar() {
  const open = useUi((s) => s.openWorkspace);
  return (
    <div className="quick-bar" role="toolbar" aria-label="Quick access">
      <AssistChip icon="accessibility_new" label="Poses" onClick={() => open('pose')} />
      <AssistChip icon="pan_tool_alt" label="Hands" onClick={() => open('pose')} />
      <AssistChip icon="person" label="Expressions" onClick={() => open('body')} />
      <AssistChip icon="lightbulb" label="Lighting" onClick={() => open('render')} />
    </div>
  );
}

function Banners() {
  const backend = useUi((s) => s.backend);
  const safeMode = useUi((s) => s.safeMode);
  const set = useUi((s) => s.set);
  return (
    <div className="banners">
      {safeMode && (
        <div className="banner banner--warning" role="status">
          <span>Safe Mode: lowest quality after a crash.</span>
          <Button variant="text" onClick={() => set({ safeMode: false })}>Leave Safe Mode</Button>
        </div>
      )}
      {backend === 'webgl2' && (
        <div className="banner" role="status">
          <span>Compatibility mode: WebGPU isn't available, so simulations are off.</span>
          <Button variant="text" onClick={() => set({ settingsOpen: true, settingsTab: 'diagnostics' })}>Details</Button>
        </div>
      )}
    </div>
  );
}

/** Drag-and-drop import anywhere on the app (PLAN.md section 4.1). */
function useFileDrop() {
  const [over, setOver] = useState(false);
  const snackbar = useSnackbar();
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = await filesFromDataTransfer(e.dataTransfer);
      const count = await startImport(false, files);
      if (!count) snackbar('No models found in what was dropped');
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, [snackbar]);
  return over;
}

export function AppShell() {
  const dropping = useFileDrop();
  const size = useWindowSizeClass();
  const workspace = useUi((s) => s.workspace);
  const workspaceOpen = useUi((s) => s.workspaceOpen);
  const inspectorOpen = useUi((s) => s.inspectorOpen);
  const set = useUi((s) => s.set);
  const openWorkspace = useUi((s) => s.openWorkspace);
  const ws = WORKSPACES.find((w) => w.id === workspace)!;
  const compact = size === 'compact';
  const navItems = WORKSPACES.map(({ id, icon, label }) => ({ id, icon, label }));

  const workspaceSheet = (Sheet: typeof SideSheet) => (
    <Sheet title={ws.title} onClose={() => set({ workspaceOpen: false })} className="workspace-sheet">
      <WorkspaceContent id={workspace} />
    </Sheet>
  );
  const inspectorSheet = (Sheet: typeof SideSheet) => (
    <Sheet title="Inspector" onClose={() => set({ inspectorOpen: false })} className="inspector-sheet">
      <Inspector />
    </Sheet>
  );
  // Large windows show both sheets; expanded shows the inspector only when
  // the workspace sheet is closed; medium overlays one sheet.
  const showInspector = inspectorOpen && (size === 'large' || (size === 'expanded' && !workspaceOpen));

  const viewportOverlay = (
    <>
      <div className="viewport-overlay viewport-overlay--top">
        <ModeSwitch />
        {!showInspector && !compact && (
          <Button variant="tonal" icon="info" onClick={() => set({ inspectorOpen: true, workspaceOpen: size === 'large' ? workspaceOpen : false })}>
            Inspector
          </Button>
        )}
      </div>
      <div className="viewport-overlay viewport-overlay--fab">
        <WorkspaceFab workspace={workspace} />
      </div>
    </>
  );

  if (compact) {
    const phoneItems = navItems.filter((i) => PHONE_PRIMARY.includes(i.id));
    const more = WORKSPACES.filter((w) => !PHONE_PRIMARY.includes(w.id));
    return (
      <div className="shell shell--compact">
        <TopBar compact />
        <Banners />
        <div className="shell__main">
          <ViewportView />
          <div className="viewport-overlay viewport-overlay--top">
            <ModeSwitch />
          </div>
          {/* FAB sits above the bottom sheet so the sheet never covers it. */}
          <div className="compact-bottom">
            <div className="compact-bottom__fab">
              <WorkspaceFab workspace={workspace} />
            </div>
            {workspaceOpen && workspaceSheet(BottomSheet)}
          </div>
        </div>
        <div className="shell__navbar">
          <NavigationBar label="Workspaces" items={phoneItems} selected={PHONE_PRIMARY.includes(workspace) ? workspace : null} onSelect={openWorkspace} />
          <Menu
            label="More workspaces"
            items={more.map((w) => ({ label: w.label, icon: w.icon, onSelect: () => openWorkspace(w.id) }))}
            trigger={<StackedAction icon="more_vert" className="shell__more" data-active={!PHONE_PRIMARY.includes(workspace) || undefined}>More</StackedAction>}
          />
        </div>
        <SettingsDialog />
        <ImportWizard />
        {dropping && <div className="drop-overlay">Drop to import</div>}
      </div>
    );
  }

  return (
    <div className={`shell shell--${size}`}>
      <TopBar compact={false} />
      <Banners />
      <div className="shell__body">
        <NavigationRail label="Workspaces" items={navItems} selected={workspaceOpen ? workspace : null} onSelect={openWorkspace} />
        {workspaceOpen && size !== 'medium' && workspaceSheet(SideSheet)}
        <div className="shell__main">
          <ViewportView />
          {viewportOverlay}
          {size === 'medium' && workspaceOpen && <div className="overlay-sheet">{workspaceSheet(SideSheet)}</div>}
          {size === 'medium' && !workspaceOpen && inspectorOpen && <div className="overlay-sheet overlay-sheet--end">{inspectorSheet(SideSheet)}</div>}
        </div>
        {showInspector && inspectorSheet(SideSheet)}
      </div>
      <QuickBar />
      <SettingsDialog />
      <ImportWizard />
      {dropping && <div className="drop-overlay">Drop to import</div>}
    </div>
  );
}
