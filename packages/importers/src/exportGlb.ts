import { Box3, Group, Matrix4, SkinnedMesh, Vector3, type Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { normalisationMatrix, type Normalisation } from './analyse';

export type ImportQuality = 'high' | 'balanced' | 'light';

/** Largest texture side per import quality (PLAN.md sections 4.3 and 4.6). */
export const TEXTURE_LIMITS: Record<ImportQuality, number> = { high: 4096, balanced: 2048, light: 1024 };

/**
 * Converts a loaded model to the app's internal format: a GLB in the bind
 * pose, in metres, Y-up, standing on the floor and centred, with textures
 * capped to the chosen size. Every import format ends up like this, so the
 * rest of the app only reads GLB.
 */
export async function exportNormalisedGlb(root: Object3D, n: Normalisation, quality: ImportQuality): Promise<{ glb: ArrayBuffer; normalised: Object3D }> {
  root.traverse((o) => {
    if (o instanceof SkinnedMesh) o.skeleton.pose();
  });
  const wrapper = new Group();
  wrapper.name = 'Poser import';
  wrapper.add(root);
  wrapper.applyMatrix4(normalisationMatrix(n));
  wrapper.updateMatrixWorld(true);
  // Feet on the floor, centred over the origin.
  const box = new Box3().setFromObject(wrapper, true);
  const c = box.getCenter(new Vector3());
  wrapper.applyMatrix4(new Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
  wrapper.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(wrapper, { binary: true, animations: [], maxTextureSize: TEXTURE_LIMITS[quality], onlyVisible: true });
  // The wrapper (normalised, on the floor) is handy for the thumbnail.
  return { glb: result as ArrayBuffer, normalised: wrapper };
}
