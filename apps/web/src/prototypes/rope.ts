/** Prototype 5 (PLAN.md section 23): a GPU rope wrapped around a limb, held by friction, pressing into soft flesh. */
import { LIMB, RopeScene } from '@poser/rope';
import { CapsuleGeometry, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { Beads } from './beads';
import { button, createPrototypePage, slider, timeGpu } from './common';

const page = await createPrototypePage(
  'Prototype 5 · Rope on a limb',
  'A rope coiled around a limb with weighted ends. Friction holds the wraps on a tilted limb; rope tension dents the soft flesh layer.',
  [0, 0.55, 0],
  [0.35, 0.7, 0.45],
);
const state = { tilt: 30, load: 1, friction: 0.8, softness: 1.5 };
let sim: RopeScene | null = null;
let rope: Beads | null = null;
let flesh: Beads | null = null;
const core = new Mesh(new CapsuleGeometry(LIMB.coreRadius, LIMB.length, 8, 24), new MeshStandardMaterial({ color: 0xb0786a, roughness: 0.7 }));
core.castShadow = true;
page.scene.add(core);

function reset() {
  if (!page.device) return;
  sim?.destroy();
  rope?.dispose(page.scene);
  flesh?.dispose(page.scene);
  const tilt = (state.tilt * Math.PI) / 180;
  sim = new RopeScene(page.device, { tilt, load: state.load, ropeFriction: state.friction, fleshSoftness: state.softness * 1e-3 });
  rope = new Beads(page.scene, sim.ropeCount, 0.004, 0xc9a35a);
  flesh = new Beads(page.scene, sim.fleshCount, 0.0045, 0xd9b49c);
  core.position.set(...LIMB.centre);
  core.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...sim.axis)));
  page.stat('Particles', String(sim.ropeCount + sim.fleshCount));
}
slider(page.panel, 'Limb tilt', 0, 60, 1, state.tilt, (v) => `${v}°`, (v) => ((state.tilt = v), reset()));
slider(page.panel, 'Load on each end', 0.1, 5, 0.1, state.load, (v) => `${v.toFixed(1)} kg`, (v) => ((state.load = v), reset()));
slider(page.panel, 'Rope friction', 0, 1.5, 0.05, state.friction, (v) => v.toFixed(2), (v) => ((state.friction = v), reset()));
slider(page.panel, 'Flesh softness', 0.2, 4, 0.1, state.softness, (v) => v.toFixed(1), (v) => ((state.softness = v), reset()));
button(page.panel, 'Reset', reset);
reset();

let simAvg = 0;
page.start(async () => {
  if (!sim || !rope || !flesh || !page.device) return;
  const ms = await timeGpu(page.device, () => sim!.step(1 / 60));
  simAvg = simAvg * 0.9 + ms * 0.1;
  page.stat('Rope step (GPU)', `${simAvg.toFixed(2)} ms`);
  const p = await sim.solver.readPositions();
  rope.update(p, 0);
  flesh.update(p, sim.ropeCount);
  page.stat('Flesh dent', `${(sim.indentation(p).max * 1000).toFixed(1)} mm`);
});
