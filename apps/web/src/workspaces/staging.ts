import { activeScene, createId, lightingPreset, sunLights, type CameraBookmark, type LightingPresetId, type Project, type SunSettings, type Subject } from '@poser/core';
import { currentProject, editProject } from '../state/project';
import { useUi } from '../state/ui';
import { viewportRef } from '../viewport/ViewportView';

/** Staging actions (PLAN.md sections 17.6 and 18): lighting, sun, camera bookmarks. All undoable. */

const DEFAULT_BACKGROUND = '#3a3a3a';

/** The figure lights are arranged around: the selected one, else the first. */
function subject(): Subject {
  const scene = activeScene(currentProject());
  const id = useUi.getState().selectedFigureId;
  const fig = scene.figures.find((f) => f.id === id) ?? scene.figures[0];
  if (!fig) return { centre: [0, 1.1, 0], yaw: 0 };
  const [x, y, z, w] = fig.transform.rotation;
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
  const p = fig.transform.position;
  return { centre: [p[0], p[1] + 1.1, p[2]], yaw };
}

export function applyLightingPreset(id: LightingPresetId, name: string): void {
  const lights = lightingPreset(id, subject());
  editProject(`Lighting: ${name}`, (p) => {
    const scene = activeScene(p as Project);
    scene.lights = lights;
    if (scene.environment.lighting === 'sun') scene.environment.background = DEFAULT_BACKGROUND;
    scene.environment.lighting = id;
  });
}

/** Time-of-day sun: replaces the lights with a sun and sky, keeping their ids while adjusting. */
export function setSun(sun: SunSettings): void {
  const { lights, background } = sunLights(sun, subject().centre);
  editProject(
    'Time of day',
    (p) => {
      const scene = activeScene(p as Project);
      if (scene.environment.lighting === 'sun' && scene.lights.length === lights.length) lights.forEach((l, i) => (l.id = scene.lights[i]!.id));
      scene.lights = lights;
      scene.environment.background = background;
      scene.environment.sun = sun;
      scene.environment.lighting = 'sun';
    },
    { coalesceKey: 'time-of-day' },
  );
}

export function addCameraBookmark(name: string): void {
  const vp = viewportRef.current;
  if (!vp) return;
  const state = vp.cameraState();
  const bookmark: CameraBookmark = { id: createId('cam'), name, focalLength: state.focalLength, position: state.position, target: state.target, height: state.height };
  editProject('Save camera', (p) => {
    activeScene(p as Project).cameras.push(bookmark);
  });
}

export function removeCameraBookmark(id: string): void {
  editProject('Delete camera', (p) => {
    const scene = activeScene(p as Project);
    scene.cameras = scene.cameras.filter((c) => c.id !== id);
  });
}

export function goToCameraBookmark(bookmark: CameraBookmark): void {
  useUi.getState().set({ lens: bookmark.focalLength });
  viewportRef.current?.setCameraState(bookmark);
}
