import { createId } from './ids';
import type { Figure, Light, Project, Scene, Transform } from './types';

export function identityTransform(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

export function createFigure(assetId: string, name: string): Figure {
  return {
    id: createId('fig'),
    name,
    assetId,
    transform: identityTransform(),
    pose: {},
    morphValues: {},
    visible: true,
    locked: false,
  };
}

/** The default studio three-point setup used for new scenes. */
export function defaultLights(): Light[] {
  const light = (name: string, position: [number, number, number], intensity: number, castShadow: boolean): Light => ({
    id: createId('light'),
    name,
    type: 'directional',
    transform: { ...identityTransform(), position },
    color: '#ffffff',
    intensity,
    castShadow,
    visible: true,
  });
  return [
    light('Key light', [2.5, 3.5, 2.5], 2.2, true),
    light('Fill light', [-3, 2, 1.5], 0.7, false),
    light('Rim light', [0, 3, -3], 1.2, false),
    { ...light('Ambient', [0, 0, 0], 0.25, false), type: 'ambient' },
  ];
}

export function createScene(name = 'Scene 1'): Scene {
  return {
    id: createId('scene'),
    name,
    figures: [createFigure('builtin:female', 'Female figure')],
    lights: defaultLights(),
    cameras: [],
    environment: { hdriAssetId: null, floor: true, grid: true, background: '#3a3a3a' },
  };
}

export function createProject(name = 'Untitled project', now = Date.now()): Project {
  const scene = createScene();
  return {
    id: createId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { units: 'metric', quality: null },
    scenes: [scene],
    activeSceneId: scene.id,
    poses: [],
  };
}

export function activeScene(project: Project): Scene {
  const scene = project.scenes.find((s) => s.id === project.activeSceneId) ?? project.scenes[0];
  if (!scene) throw new Error('Project has no scenes');
  return scene;
}
