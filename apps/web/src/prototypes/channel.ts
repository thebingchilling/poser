/** Prototype 6 (PLAN.md section 23): a soft toy following a soft-body channel with stretch limits. */
import { ChannelScene } from '@poser/interaction';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { Beads } from './beads';
import { button, createPrototypePage, slider, timeGpu } from './common';

const page = await createPrototypePage(
  'Prototype 6 · Insertion channel',
  'A flexible toy pushed into a curved soft channel. The channel opens up to its stretch limit, guides the toy along the curve, and closes again.',
  [0, 0.53, -0.07],
  [0.3, 0.62, 0.05],
);
const state = { friction: 0.15, stretch: 4, auto: true, depth: -0.02 };
let sim: ChannelScene | null = null;
let toy: Beads | null = null;
let wall: Mesh | null = null;
let time = 0;

function reset() {
  if (!page.device) return;
  sim?.destroy();
  toy?.dispose(page.scene);
  if (wall) page.scene.remove(wall);
  sim = new ChannelScene(page.device, { friction: state.friction, maxStretch: state.stretch });
  toy = new Beads(page.scene, sim.toyCount, sim.toyRadius, 0x7a3fa0);
  // The wall as a surface through its particle rings.
  const n = sim.rings * sim.around;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  const idx: number[] = [];
  for (let r = 0; r + 1 < sim.rings; r++) {
    for (let a = 0; a < sim.around; a++) {
      const i = r * sim.around + a;
      const j = r * sim.around + ((a + 1) % sim.around);
      idx.push(i, j, i + sim.around, j, j + sim.around, i + sim.around);
    }
  }
  geo.setIndex(idx);
  wall = new Mesh(geo, new MeshStandardMaterial({ color: 0xc98a8a, roughness: 0.5, side: DoubleSide, transparent: true, opacity: 0.55 }));
  wall.frustumCulled = false;
  page.scene.add(wall);
  time = 0;
}

slider(page.panel, 'Friction (lubrication lowers it)', 0, 0.8, 0.05, state.friction, (v) => v.toFixed(2), (v) => ((state.friction = v), reset()));
slider(page.panel, 'Stretch limit', 1.5, 6, 0.1, state.stretch, (v) => `${v.toFixed(1)}×`, (v) => ((state.stretch = v), reset()));
const depthSlider = slider(page.panel, 'Depth (manual)', -0.02, 0.12, 0.002, state.depth, (v) => `${(v * 100).toFixed(1)} cm`, (v) => {
  state.auto = false;
  state.depth = v;
});
button(page.panel, 'Automatic in and out', () => ((state.auto = true), (time = 0)));
button(page.panel, 'Reset', reset);
reset();

let simAvg = 0;
page.start(async (dt) => {
  if (!sim || !toy || !wall || !page.device) return;
  if (state.auto) {
    time += dt;
    // 3 s in, 1 s hold, 3 s out, 1 s rest.
    const t = time % 8;
    state.depth = t < 3 ? -0.02 + (0.13 * t) / 3 : t < 4 ? 0.11 : t < 7 ? 0.11 - (0.13 * (t - 4)) / 3 : -0.02;
    depthSlider.value = String(state.depth);
  }
  sim.setDepth(state.depth);
  const ms = await timeGpu(page.device, () => sim!.step(1 / 60));
  simAvg = simAvg * 0.9 + ms * 0.1;
  page.stat('Step (GPU)', `${simAvg.toFixed(2)} ms`);
  const p = await sim.solver.readPositions();
  toy.update(p, 0);
  const attr = wall.geometry.getAttribute('position') as BufferAttribute;
  const arr = attr.array as Float32Array;
  for (let k = 0; k < sim.rings * sim.around; k++) {
    const i = (sim.toyCount + k) * 4;
    arr.set([p[i]!, p[i + 1]!, p[i + 2]!], k * 3);
  }
  attr.needsUpdate = true;
  wall.geometry.computeVertexNormals();
  page.stat('Ring stretch (max)', `${sim.maxRingStretch(p).toFixed(2)}× of ${state.stretch.toFixed(1)}×`);
  page.stat('Tip off centre line', `${(sim.tipOffset(p).offset * 1000).toFixed(1)} mm`);
});
