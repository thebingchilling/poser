/** Prototype 2 (PLAN.md section 23): an XPBD skirt on WebGPU around a walking capsule body. */
import { SkirtScene } from '@poser/cloth';
import { BufferAttribute, BufferGeometry, CapsuleGeometry, DoubleSide, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { button, createPrototypePage, slider, timeGpu } from './common';

const page = await createPrototypePage(
  'Prototype 2 · GPU cloth',
  'An XPBD skirt simulated with WebGPU compute, colliding with a walking capsule body. Target: 30+ fps.',
  [0, 0.75, 0],
  [1.6, 1.2, 2.2],
);

const walker = { cadence: 0.9, stride: 0.45 };
let substeps = 20;
let paused = false;
let sim: SkirtScene | null = null;
let cloth: Mesh | null = null;
const bodyMat = new MeshStandardMaterial({ color: 0xd9b49c, roughness: 0.6 });
const bodyMeshes: Mesh[] = [];

function reset() {
  if (!page.device) return;
  sim?.destroy();
  if (cloth) page.scene.remove(cloth);
  sim = new SkirtScene(page.device, { walker, substeps });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(sim.skirt.particles.length * 3), 3));
  geo.setIndex(new BufferAttribute(sim.skirt.indices, 1));
  cloth = new Mesh(geo, new MeshStandardMaterial({ color: 0x8e3b5a, roughness: 0.85, side: DoubleSide }));
  cloth.castShadow = true;
  cloth.frustumCulled = false;
  page.scene.add(cloth);
  page.stat('Particles', String(sim.skirt.particles.length));
  page.stat('Constraints', String(sim.skirt.constraints.length));
}

slider(page.panel, 'Walking speed', 0, 2, 0.05, walker.cadence, (v) => `${v.toFixed(2)} steps/s`, (v) => (walker.cadence = v));
slider(page.panel, 'Stride', 0, 0.8, 0.05, walker.stride, (v) => `${Math.round((v * 180) / Math.PI)}°`, (v) => (walker.stride = v));
slider(page.panel, 'Substeps', 4, 40, 1, substeps, (v) => String(v), (v) => ((substeps = v), reset()));
button(page.panel, 'Pause / play', () => (paused = !paused));
button(page.panel, 'Reset', reset);
reset();

const up = new Vector3(0, 1, 0);
let simAvg = 0;
page.start(async (dt) => {
  if (!sim || !cloth || !page.device) return;
  if (!paused) {
    const ms = await timeGpu(page.device, () => sim!.step(1 / 60));
    simAvg = simAvg * 0.9 + ms * 0.1;
    page.stat('Cloth step (GPU)', `${simAvg.toFixed(2)} ms`);
  }
  void dt;
  const p = await sim.solver.readPositions();
  const attr = cloth.geometry.getAttribute('position') as BufferAttribute;
  const arr = attr.array as Float32Array;
  for (let i = 0; i < p.length / 4; i++) arr.set([p[i * 4]!, p[i * 4 + 1]!, p[i * 4 + 2]!], i * 3);
  attr.needsUpdate = true;
  cloth.geometry.computeVertexNormals();
  cloth.geometry.computeBoundingSphere();
  sim.capsules.forEach((c, k) => {
    let m = bodyMeshes[k];
    const a = new Vector3(...c.a);
    const b = new Vector3(...c.b);
    const len = a.distanceTo(b);
    if (!m) {
      m = new Mesh(new CapsuleGeometry(c.radius, 1, 6, 16), bodyMat);
      m.castShadow = true;
      bodyMeshes[k] = m;
      page.scene.add(m);
    }
    // Rebuild the length each frame; geometry stays a unit-height cylinder part scaled along Y.
    m.geometry.dispose();
    m.geometry = new CapsuleGeometry(c.radius, Math.max(len, 0.001), 6, 16);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
  });
});
