/** Prototype 3 (PLAN.md section 23): fit placeholder anatomy into a thigh and cut it with Manifold. */
import { HEAVY_THIGH, LAYER_COLOURS, SLIM_THIGH, buildImportedThigh, buildLayers, cutLayers, fitThigh, loadManifold, type LayerName } from '@poser/cutting';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { button, createPrototypePage, slider } from './common';

const page = await createPrototypePage(
  'Prototype 3 · Anatomy fit and cut',
  'Placeholder anatomy fitted into an irregular "imported" thigh, then cut with Manifold booleans. Target: cut in under 1 s.',
  [0, 0.68, 0],
  [0.62, 0.78, 0.5],
  { needsGpu: false },
);
const M = await loadManifold(wasmUrl);

const state = { heavy: true, bodyFat: 1, height: 0.5, angle: 20, gap: 0.09 };
const group = new Group();
page.scene.add(group);
const materials = Object.fromEntries(Object.entries(LAYER_COLOURS).map(([k, c]) => [k, new MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: k !== 'skin' })])) as Record<LayerName, MeshStandardMaterial>;

function toMesh(m: ReturnType<typeof M.Manifold.prototype.getMesh>, material: MeshStandardMaterial, shift: number) {
  const pos = new Float32Array(m.numVert * 3);
  for (let i = 0; i < m.numVert; i++) {
    const x = m.vertProperties[i * m.numProp]!;
    const y = m.vertProperties[i * m.numProp + 1]!;
    const z = m.vertProperties[i * m.numProp + 2]!;
    // Limb frame (Z down the femur) to world: thigh upright with the hip at the top.
    pos.set([x, 0.95 - z + shift, y], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(new BufferAttribute(m.triVerts, 1));
  g.computeVertexNormals();
  const mesh = new Mesh(g, material);
  mesh.castShadow = true;
  return mesh;
}

function rebuild() {
  for (const c of [...group.children]) {
    group.remove(c);
    (c as Mesh).geometry.dispose();
  }
  const shape = state.heavy ? HEAVY_THIGH : SLIM_THIGH;
  let t0 = performance.now();
  const fit = fitThigh(buildImportedThigh(shape), shape, state.bodyFat);
  page.stat('Fit', `${(performance.now() - t0).toFixed(0)} ms`);
  page.stat('Bone cover (min)', `${(fit.report.minBoneCover * 1000).toFixed(1)} mm`);
  page.stat('Fat thickness', `${(fit.report.minFat * 1000).toFixed(0)}–${(fit.report.maxFat * 1000).toFixed(0)} mm`);
  t0 = performance.now();
  const layers = buildLayers(M, fit);
  for (const m of Object.values(layers)) m.numTri();
  page.stat('Build layers', `${(performance.now() - t0).toFixed(0)} ms`);
  const a = (state.angle * Math.PI) / 180;
  const normal: [number, number, number] = [0, Math.sin(a), Math.cos(a)];
  const cut = cutLayers(layers, normal, shape.length * state.height * normal[2]);
  page.stat('Cut (9 layers)', `${cut.ms.toFixed(0)} ms`);
  for (const [name, [lower, upper]] of Object.entries(cut.pieces) as [LayerName, [typeof cut.pieces.skin[0], typeof cut.pieces.skin[0]]][]) {
    // Pieces are pulled apart so both cut faces show.
    group.add(toMesh(lower.getMesh(), materials[name], 0), toMesh(upper.getMesh(), materials[name], state.gap));
  }
}

const heavyBtn = button(page.panel, 'Thigh: heavy (tap for slim)', () => {
  state.heavy = !state.heavy;
  heavyBtn.textContent = state.heavy ? 'Thigh: heavy (tap for slim)' : 'Thigh: slim (tap for heavy)';
  rebuild();
});
slider(page.panel, 'Body fat', 0.4, 1.6, 0.05, state.bodyFat, (v) => `${Math.round(v * 100)}%`, (v) => ((state.bodyFat = v), rebuild()));
slider(page.panel, 'Cut height', 0.1, 0.9, 0.01, state.height, (v) => `${Math.round(v * 100)}%`, (v) => ((state.height = v), rebuild()));
slider(page.panel, 'Cut angle', -45, 45, 1, state.angle, (v) => `${v}°`, (v) => ((state.angle = v), rebuild()));
slider(page.panel, 'Separation', 0, 0.12, 0.005, state.gap, (v) => `${Math.round(v * 100)} cm`, (v) => ((state.gap = v), rebuild()));
rebuild();
page.start(() => {});
