/**
 * Shared setup for the prototype pages (PLAN.md section 23): renderer with
 * the WebGPU self-test, camera, lights, floor, a control panel, and stats.
 */
import { webgpuSelfTest } from '@poser/platform';
import { AmbientLight, Color, DirectionalLight, GridHelper, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './prototype.css';

export interface PrototypePage {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGPURenderer;
  controls: OrbitControls;
  panel: HTMLElement;
  /** A GPU device for simulations, or null if WebGPU doesn't work here. */
  device: GPUDevice | null;
  stat(label: string, value: string): void;
  start(frame: (dt: number) => void | Promise<void>): void;
}

export async function createPrototypePage(
  title: string,
  description: string,
  target: [number, number, number],
  cameraPos: [number, number, number],
  { needsGpu = true } = {},
): Promise<PrototypePage> {
  document.title = title;
  const root = document.getElementById('root')!;
  root.innerHTML = `<canvas class="proto-canvas"></canvas><div class="proto-panel"><h1></h1><p></p><div class="proto-controls"></div><dl></dl></div>`;
  root.querySelector('h1')!.textContent = title;
  root.querySelector('p')!.textContent = description;
  const canvas = root.querySelector('canvas')!;
  const test = await webgpuSelfTest();
  let device: GPUDevice | null = null;
  if (test.ok) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    device = (await adapter?.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(10, adapter.limits.maxStorageBuffersPerShaderStage) } })) ?? null;
  }
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: !test.ok });
  await renderer.init();
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new Scene();
  scene.background = new Color(0x3a3a3a);
  const camera = new PerspectiveCamera(35, 1, 0.02, 50);
  camera.position.set(...cameraPos);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...target);
  controls.update();
  scene.add(new AmbientLight(0xffffff, 0.5));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, new GridHelper(10, 10, 0x777777, 0x555555));

  const dl = root.querySelector('dl')!;
  const stats = new Map<string, HTMLElement>();
  const stat = (label: string, value: string) => {
    let dd = stats.get(label);
    if (!dd) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      dd = document.createElement('dd');
      dl.append(dt, dd);
      stats.set(label, dd);
    }
    dd.textContent = value;
  };
  stat('Renderer', test.ok ? 'WebGPU' : 'WebGL2 (compatibility)');
  if (!test.ok && needsGpu) stat('Simulation', `Needs WebGPU (${test.reason})`);

  const resize = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    panel: root.querySelector('.proto-controls')!,
    device,
    stat,
    start(frame) {
      let last = performance.now();
      let busy = false;
      let fps = 0;
      renderer.setAnimationLoop(async () => {
        if (busy) return;
        busy = true;
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 1 / 20);
        fps = fps * 0.9 + (1 / Math.max(dt, 1e-3)) * 0.1;
        last = now;
        try {
          await frame(dt);
        } finally {
          busy = false;
        }
        controls.update();
        renderer.render(scene, camera);
        stat('Frame rate', `${fps.toFixed(0)} fps`);
      });
    },
  };
}

/** Adds a labelled control to the panel. */
export function slider(panel: HTMLElement, label: string, min: number, max: number, step: number, value: number, format: (v: number) => string, onChange: (v: number) => void): HTMLInputElement {
  const l = document.createElement('label');
  const input = Object.assign(document.createElement('input'), { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = document.createElement('output');
  const text = document.createElement('span');
  text.textContent = label;
  const sync = () => (out.textContent = format(Number(input.value)));
  input.addEventListener('input', () => (sync(), onChange(Number(input.value))));
  sync();
  l.append(text, out, input);
  panel.append(l);
  return input;
}

export function button(panel: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
  b.addEventListener('click', onClick);
  panel.append(b);
  return b;
}

/** Measures GPU time for work submitted inside `fn`. */
export async function timeGpu(device: GPUDevice, fn: () => void): Promise<number> {
  const t0 = performance.now();
  fn();
  await device.queue.onSubmittedWorkDone();
  return performance.now() - t0;
}
