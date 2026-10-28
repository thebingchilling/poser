/**
 * WebGPU in Node for tests, through Dawn's Node bindings (the `webgpu`
 * package). Machines without a Vulkan driver (like Claude's build
 * environment) can use the SwiftShader software Vulkan that ships with
 * Chromium. Results check correctness and stability; timings from a
 * software GPU are meaningless, so performance is measured on real devices.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findSwiftShaderIcd(): string | null {
  const roots = ['/opt/pw-browsers', join(process.env.HOME ?? '', '.cache/ms-playwright')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const sub of ['chrome-linux64', 'chrome-linux', 'chrome-headless-shell-linux64']) {
        const icd = join(root, dir, sub, 'vk_swiftshader_icd.json');
        if (existsSync(icd)) return icd;
      }
    }
  }
  return null;
}

let devicePromise: Promise<GPUDevice | null> | null = null;
// The Dawn instance must outlive its devices; if it is garbage-collected,
// Dawn tears down underneath them and crashes.
let gpuInstance: unknown = null;

/** A GPUDevice for tests, or null when no WebGPU implementation is available. */
export function testDevice(): Promise<GPUDevice | null> {
  devicePromise ??= (async () => {
    try {
      if (!process.env.VK_ICD_FILENAMES) {
        const icd = findSwiftShaderIcd();
        if (icd) process.env.VK_ICD_FILENAMES = icd;
      }
      const { create, globals } = await import('webgpu');
      Object.assign(globalThis, globals);
      const gpu = create([]);
      gpuInstance = gpu;
      const adapter = await gpu.requestAdapter();
      if (!adapter) return null;
      return await adapter.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(10, adapter.limits.maxStorageBuffersPerShaderStage) },
      });
    } catch {
      return null;
    }
  })();
  return devicePromise;
}

/**
 * Writes a frame for visual inspection when POSER_SNAPSHOT_DIR is set
 * (meshes, capsules, points, spheres; see the prototype snapshot viewer).
 */
export async function writeSnapshot(name: string, data: unknown): Promise<void> {
  const dir = process.env.POSER_SNAPSHOT_DIR;
  if (!dir) return;
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data));
}

/** xyz from a vec4 position buffer. */
export function xyz(positions: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < positions.length / 4; i++) out.push(positions[i * 4]!, positions[i * 4 + 1]!, positions[i * 4 + 2]!);
  return out;
}
