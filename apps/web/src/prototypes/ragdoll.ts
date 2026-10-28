/**
 * Prototype 1 (PLAN.md section 23, "Prototype the hardest parts first"):
 * a Jolt ragdoll holding a pose with muscle motors and settling onto a box.
 * Throwaway test page; physics runs on the main thread here (the real build
 * moves Jolt into a worker).
 */
import { FEMALE_PROPORTIONS, MALE_PROPORTIONS } from '@poser/rig';
import { SEAT, SITTING_POSE, createSeatScene, loadJolt, type SeatScene } from '@poser/physics';
import { webgpuSelfTest } from '@poser/platform';
import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './prototype.css';

const root = document.getElementById('root')!;
root.innerHTML = `
  <canvas class="proto-canvas"></canvas>
  <div class="proto-panel">
    <h1>Prototype 1 · Ragdoll Settle</h1>
    <p>A physics ragdoll built from the canonical rig drops onto a box and holds a sitting pose with muscle motors.</p>
    <label>Figure <select id="figure"><option value="female">Female</option><option value="male">Male</option></select></label>
    <label>Drop height <input id="drop" type="range" min="0" max="0.6" step="0.05" value="0.15"><output id="dropOut"></output></label>
    <label>Muscle strength <input id="strength" type="range" min="0" max="2" step="0.05" value="1"><output id="strengthOut"></output></label>
    <label class="check"><input id="motors" type="checkbox" checked> Motors on</label>
    <button id="reset" type="button">Drop again</button>
    <dl>
      <dt>Physics step</dt><dd id="stepMs">–</dd>
      <dt>Settled after</dt><dd id="settled">–</dd>
      <dt>Renderer</dt><dd id="backend">–</dd>
    </dl>
  </div>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const J = await loadJolt();
const test = await webgpuSelfTest();
const canvas = root.querySelector('canvas')!;
const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: !test.ok });
await renderer.init();
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('backend').textContent = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2 (compatibility)';

const scene = new Scene();
scene.background = new Color(0x3a3a3a);
const camera = new PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(2.2, 1.4, 2.4);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.55, 0);
controls.update();
scene.add(new AmbientLight(0xffffff, 0.5));
const sun = new DirectionalLight(0xffffff, 2.2);
sun.position.set(2, 4, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -2;
sc.right = sc.top = 2;
scene.add(sun);
const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor, new GridHelper(10, 10, 0x777777, 0x555555));
const seat = new Mesh(new BoxGeometry(...SEAT.half.map((h) => h * 2) as [number, number, number]), new MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.8 }));
seat.position.set(...SEAT.center);
seat.castShadow = seat.receiveShadow = true;
scene.add(seat);

const skin = new MeshStandardMaterial({ color: 0xd9b49c, roughness: 0.6 });
let sim: SeatScene | null = null;
let meshes: Group[] = [];
let elapsed = 0;
let calm = 0;
let settledAt: number | null = null;

function reset() {
  sim?.world.destroy();
  for (const m of meshes) scene.remove(m);
  meshes = [];
  const proportions = $<HTMLSelectElement>('figure').value === 'male' ? MALE_PROPORTIONS : FEMALE_PROPORTIONS;
  const strength = Number($<HTMLInputElement>('strength').value);
  sim = createSeatScene(J, proportions, SITTING_POSE, Number($<HTMLInputElement>('drop').value), { strengthScale: Math.max(0.001, strength) });
  sim.ragdoll.setMotorsEnabled($<HTMLInputElement>('motors').checked && strength > 0);
  // One capsule mesh per body, in the body's frame (origin at the joint), matching the physics shape.
  sim.ragdoll.capsules.forEach((c) => {
    const dir = new Vector3(...c.direction);
    const halfHeight = Math.max(0.005, c.length / 2 - c.radius * 0.5);
    const mesh = new Mesh(new CapsuleGeometry(c.radius, halfHeight * 2, 6, 16), skin);
    mesh.castShadow = true;
    mesh.position.copy(dir.clone().multiplyScalar(c.length / 2));
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    const g = new Group();
    g.add(mesh);
    scene.add(g);
    meshes.push(g);
  });
  elapsed = 0;
  calm = 0;
  settledAt = null;
  $('settled').textContent = '–';
}

for (const id of ['figure', 'drop', 'strength', 'motors']) $(id).addEventListener('change', reset);
$('reset').addEventListener('click', reset);
const syncOutputs = () => {
  $('dropOut').textContent = `${Math.round(Number($<HTMLInputElement>('drop').value) * 100)} cm`;
  $('strengthOut').textContent = `${Math.round(Number($<HTMLInputElement>('strength').value) * 100)}%`;
};
$('drop').addEventListener('input', syncOutputs);
$('strength').addEventListener('input', syncOutputs);
syncOutputs();
reset();

const resize = () => {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(canvas);
resize();

const dt = 1 / 60;
let accumulator = 0;
let last = performance.now();
let stepAvg = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  accumulator = Math.min(accumulator + (now - last) / 1000, 0.1);
  last = now;
  while (sim && accumulator >= dt) {
    const t0 = performance.now();
    sim.world.step(dt, 2);
    stepAvg = stepAvg * 0.95 + (performance.now() - t0) * 0.05;
    accumulator -= dt;
    elapsed += dt;
    const bi = sim.world.system.GetBodyInterface();
    let maxSpeed = 0;
    for (let b = 0; b < sim.ragdoll.ragdoll.GetBodyCount(); b++) {
      const v = bi.GetLinearVelocity(sim.ragdoll.ragdoll.GetBodyID(b));
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.GetX(), v.GetY(), v.GetZ()));
    }
    calm = maxSpeed < 0.05 ? calm + dt : 0;
    if (settledAt === null && calm >= 0.25) {
      settledAt = elapsed;
      $('settled').textContent = `${settledAt.toFixed(2)} s`;
    }
  }
  if (sim) {
    sim.ragdoll.bodyTransforms().forEach((t, i) => {
      meshes[i]?.position.set(...t.position);
      meshes[i]?.quaternion.set(...t.rotation);
    });
  }
  $('stepMs').textContent = `${stepAvg.toFixed(2)} ms`;
  controls.update();
  renderer.render(scene, camera);
});
