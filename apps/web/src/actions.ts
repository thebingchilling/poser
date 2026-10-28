import { activeScene, createFigure, createProject, deleteProject, loadProject, saveProject, type Project } from '@poser/core';
import { BUILTIN_FIGURES, type BuiltinFigureId } from '@poser/render';
import { POSER_EXTENSION, POSER_MIME, exportPoserFile, importPoserFile, poserFileName } from '@poser/platform';
import { crashGuard } from './platformServices';
import { currentProject, editProject, projectStore } from './state/project';
import { useUi } from './state/ui';
import { viewportRef } from './viewport/ViewportView';

export function undo(): string | null {
  return projectStore.getState().undo();
}

export function redo(): string | null {
  return projectStore.getState().redo();
}

export function addBuiltinFigure(id: BuiltinFigureId): void {
  const def = BUILTIN_FIGURES[id];
  const fig = createFigure(id, def.name);
  const count = activeScene(currentProject()).figures.length;
  // Place new figures side by side, about a metre apart.
  fig.transform.position = [count === 0 ? 0 : (count % 2 ? 1 : -1) * Math.ceil(count / 2) * 0.9, 0, 0];
  editProject(`Add ${def.name.toLowerCase()}`, (p) => {
    activeScene(p as Project).figures.push(fig);
  });
  useUi.getState().set({ selectedFigureId: fig.id });
}

export function removeFigure(figureId: string): void {
  editProject('Remove figure', (p) => {
    const scene = activeScene(p as Project);
    scene.figures = scene.figures.filter((f) => f.id !== figureId);
  });
  if (useUi.getState().selectedFigureId === figureId) useUi.getState().set({ selectedFigureId: null });
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function captureScreenshot(): Promise<void> {
  const vp = viewportRef.current;
  if (!vp) throw new Error('The viewport is not ready');
  const blob = await vp.capture();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(blob, `poser-${stamp}.png`);
}

export function exportProjectFile(): void {
  const project = currentProject();
  download(new Blob([exportPoserFile(project) as Uint8Array<ArrayBuffer>], { type: POSER_MIME }), poserFileName(project));
}

/** Opens a file picker and imports a .poser file as the current project. */
export function importProjectFile(): Promise<Project | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${POSER_EXTENSION},${POSER_MIME},application/zip`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const { project } = importPoserFile(new Uint8Array(await file.arrayBuffer()));
        await openProject(project);
        resolve(project);
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

export async function openProject(project: Project): Promise<void> {
  // Save what we have first so switching never loses work.
  await saveProject(currentProject());
  projectStore.getState().load(project);
  await saveProject(project);
  useUi.getState().set({ selectedFigureId: null });
  viewportRef.current?.frameAll();
}

export async function openProjectById(id: string): Promise<void> {
  const project = await crashGuard.guard('Opening a project', () => loadProject(id));
  if (!project) throw new Error('That project no longer exists');
  await openProject(project);
}

export async function newProject(): Promise<void> {
  await openProject(createProject());
}

export async function deleteCurrentProject(): Promise<void> {
  const id = currentProject().id;
  await deleteProject(id);
  projectStore.getState().load(createProject());
  await saveProject(currentProject());
}

export function renameProject(name: string): void {
  editProject('Rename project', (p) => {
    p.name = name.trim() || 'Untitled project';
  });
}
