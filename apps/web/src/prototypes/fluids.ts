/** Prototype 4 (PLAN.md section 23): MLS-MPM blood from a forearm wound, plus a surface-flow trickle. */
import { BleedScene, FLUID_PRESETS, FOREARM, UPPER_ARM } from '@poser/fluids';
import { BufferAttribute, BufferGeometry, CapsuleGeometry, Color, Mesh, MeshStandardMaterial, Points, PointsMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { button, createPrototypePage, slider, timeGpu } from './common';

const page = await createPrototypePage(
  'Prototype 4 · Fluids',
  'Blood from a forearm wound: MLS-MPM particles flow over the arm and pool; a thin film (texture-space surface flow) trickles around the arm and drips.',
  [0, 0.3, 0],
  [0.7, 0.65, 0.85],
);

const skin = new MeshStandardMaterial({ color: 0xd9b49c, roughness: 0.6, vertexColors: true });
function capsuleMesh(c: typeof FOREARM) {
  const a = new Vector3(...c.a);
  const b = new Vector3(...c.b);
  const geo = new CapsuleGeometry(c.radius, a.distanceTo(b), 12, 64);
  const colours = new Float32Array(geo.getAttribute('position').count * 3).fill(1);
  geo.setAttribute('color', new BufferAttribute(colours, 3));
  const m = new Mesh(geo, skin);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  m.castShadow = true;
  m.receiveShadow = true;
  page.scene.add(m);
  return m;
}
const forearm = capsuleMesh(FOREARM);
capsuleMesh(UPPER_ARM);

let preset: keyof typeof FLUID_PRESETS = 'blood';
let sim: BleedScene | null = null;
let points: Points | null = null;
let rate = 1500;

function reset() {
  if (!page.device) return;
  sim?.destroy();
  if (points) page.scene.remove(points);
  sim = new BleedScene(page.device, { preset: FLUID_PRESETS[preset] });
  sim.bleedRate = rate;
  const max = sim.fluid.opts.maxParticles;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
  points = new Points(geo, new PointsMaterial({ color: FLUID_PRESETS[preset].colour, size: 0.007 }));
  points.frustumCulled = false;
  page.scene.add(points);
}

slider(page.panel, 'Bleed rate', 0, 4000, 100, rate, (v) => `${v} particles/s`, (v) => {
  rate = v;
  if (sim) sim.bleedRate = v;
});
const toggle = button(page.panel, 'Stop bleeding', () => {
  if (!sim) return;
  sim.setBleeding(!sim.bleeding);
  toggle.textContent = sim.bleeding ? 'Stop bleeding' : 'Start bleeding';
});
const presetBtn = button(page.panel, 'Fluid: blood', () => {
  const keys = Object.keys(FLUID_PRESETS) as (keyof typeof FLUID_PRESETS)[];
  preset = keys[(keys.indexOf(preset) + 1) % keys.length]!;
  presetBtn.textContent = `Fluid: ${FLUID_PRESETS[preset].name.toLowerCase()}`;
  reset();
});
button(page.panel, 'Reset', reset);
reset();

// Film thickness → skin tint on the forearm, by mapping each vertex to its film cell.
const forearmPos = forearm.geometry.getAttribute('position');
const forearmCol = forearm.geometry.getAttribute('color') as BufferAttribute;
const filmColour = new Color(FLUID_PRESETS.blood.colour);
let simAvg = 0;
let frame = 0;
page.start(async () => {
  if (!sim || !points || !page.device) return;
  const ms = await timeGpu(page.device, () => sim!.step(1 / 60));
  simAvg = simAvg * 0.9 + ms * 0.1;
  page.stat('Fluid step (GPU)', `${simAvg.toFixed(2)} ms`);
  const p = await sim.fluid.readPositions();
  const attr = points.geometry.getAttribute('position') as BufferAttribute;
  (attr.array as Float32Array).set(p);
  attr.needsUpdate = true;
  points.geometry.setDrawRange(0, p.length / 3);
  page.stat('Particles', String(p.length / 3));
  if (frame++ % 4 === 0) {
    const h = await sim.film.readThickness();
    const film = sim.film;
    const len = film.length;
    for (let i = 0; i < forearmPos.count; i++) {
      // Capsule geometry is along local Y, centred; recover (angle, along).
      const x = forearmPos.getX(i);
      const y = forearmPos.getY(i);
      const z = forearmPos.getZ(i);
      const along = Math.min(0.999, Math.max(0, (y + len / 2) / len));
      // Local X/Z → angle around; local frame differs from the film's, so match by world direction.
      const world = new Vector3(x, y, z).applyQuaternion(forearm.quaternion);
      const axis = new Vector3(...film.axis);
      const radial = world.clone().sub(axis.clone().multiplyScalar(world.dot(axis))).normalize();
      const e1 = new Vector3(...film.e1);
      const e2 = axis.clone().cross(e1);
      const th = (Math.atan2(radial.dot(e2), radial.dot(e1)) + Math.PI * 2) % (Math.PI * 2);
      const u = Math.floor((th / (Math.PI * 2)) * film.nu) % film.nu;
      const v = Math.floor(along * film.nv);
      const t = Math.min(1, (h[v * film.nu + u] ?? 0) / 0.0006);
      forearmCol.setXYZ(i, 1 + (filmColour.r * 1.2 - 1) * t, 1 + (filmColour.g * 1.2 - 1) * t, 1 + (filmColour.b * 1.2 - 1) * t);
    }
    forearmCol.needsUpdate = true;
    page.stat('Dripped from film', `${((await film.readDripped()) * 1e3).toFixed(1)} mm·cells`);
  }
});
