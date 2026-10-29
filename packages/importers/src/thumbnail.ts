import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';

let renderer: WebGLRenderer | null = null;

/**
 * A small square picture of a model for the Library (PLAN.md section 4.4).
 * Uses a separate WebGL renderer so it works whatever the main viewport uses.
 */
export function renderThumbnail(object: Object3D, size = 256): string {
  renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x3a3a3a, 1);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(1, 2, 3);
  scene.add(sun);
  const parent = object.parent;
  scene.add(object);
  object.updateMatrixWorld(true);
  const box = new Box3().setFromObject(object, true);
  const centre = box.getCenter(new Vector3());
  const dims = box.getSize(new Vector3());
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);
  const dist = (Math.max(dims.y, dims.x * 1.1, dims.z) / 2 / Math.tan((15 * Math.PI) / 180)) * 1.15;
  camera.position.set(centre.x + dist * 0.35, centre.y + dims.y * 0.05, centre.z + dist * 0.94);
  camera.lookAt(centre);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/webp', 0.85);
  scene.remove(object);
  if (parent) parent.add(object);
  return url;
}
