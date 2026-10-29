import { Color, MeshBasicMaterial, MeshStandardMaterial, RenderPipeline, type Camera, type Material, type Object3D, type Scene, type WebGPURenderer } from 'three/webgpu';
import { Fn, luminance, pass, step, uniform, vec3, vec4 } from 'three/tsl';

/**
 * Study modes (PLAN.md section 18) for artists: clay (plain matte grey),
 * silhouette (black shapes on white), and 2- or 3-value notan (light and
 * shadow reduced to black, grey, and white, shadows included).
 */
export type StudyMode = 'normal' | 'clay' | 'silhouette' | 'notan2' | 'notan3';

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  normal: 'Normal',
  clay: 'Clay',
  silhouette: 'Silhouette',
  notan2: 'Notan (2 values)',
  notan3: 'Notan (3 values)',
};

const clay = new MeshStandardMaterial({ color: 0xb8b3ad, roughness: 0.85, metalness: 0 });
const black = new MeshBasicMaterial({ color: 0x000000 });

/** Swaps materials on a figure or prop for a study mode, or restores them. */
export function applyStudyMaterials(root: Object3D, mode: StudyMode): void {
  const study = mode === 'normal' ? null : mode === 'silhouette' ? black : clay;
  root.traverse((o) => {
    const mesh = o as Object3D & { isMesh?: boolean; material?: Material | Material[]; userData: { studyOriginal?: Material | Material[] } };
    if (!mesh.isMesh || !mesh.material) return;
    if (study) {
      mesh.userData.studyOriginal ??= mesh.material;
      mesh.material = study;
    } else if (mesh.userData.studyOriginal) {
      mesh.material = mesh.userData.studyOriginal;
      delete mesh.userData.studyOriginal;
    }
  });
}

/** Background, floor, and grid for a mode (null = keep the scene's own). */
export function studyStage(mode: StudyMode): { background: Color | null; floor: boolean | null; grid: boolean | null } {
  if (mode === 'silhouette') return { background: new Color(0xffffff), floor: false, grid: false };
  // Backgrounds that land on a value of their own: black for 2 values, mid grey for 3.
  if (mode === 'notan2') return { background: new Color(0x1e1e1e), floor: true, grid: false };
  if (mode === 'notan3') return { background: new Color(0x6e6e6e), floor: true, grid: false };
  if (mode === 'clay') return { background: null, floor: null, grid: false };
  return { background: null, floor: null, grid: null };
}

/** Post-processing for notan: thresholds the lit clay render into flat values. */
export class NotanPass {
  readonly pipeline: RenderPipeline;
  /** Luminance split between dark and light (0–1, on the displayed image). */
  readonly threshold = uniform(0.35);
  private readonly levels = uniform(2);

  constructor(renderer: WebGPURenderer, scene: Scene, camera: Camera) {
    const scenePass = pass(scene, camera);
    const t = this.threshold;
    const levels = this.levels;
    const output = Fn(() => {
      const c = scenePass.getTextureNode().rgb;
      // Compare on a roughly perceptual scale (the pass is linear).
      const l = luminance(c).pow(1 / 2.2);
      const two = step(t, l);
      // Three values: shadow below the split, light well above it, mid grey (0.21 linear ≈ 50% on screen) between.
      const three = step(t, l).mul(0.21).add(step(t.add(0.25), l).mul(0.79));
      const v = levels.equal(2).select(two, three);
      return vec4(vec3(v), 1);
    })();
    this.pipeline = new RenderPipeline(renderer, output);
  }

  setLevels(levels: 2 | 3): void {
    this.levels.value = levels;
  }

  render(): void {
    this.pipeline.render();
  }

  dispose(): void {
    this.pipeline.dispose();
  }
}
