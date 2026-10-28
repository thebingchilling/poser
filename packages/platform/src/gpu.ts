/** What the browser reports about the GPU (PLAN.md section 3.5, step 1). */

export interface GpuInfo {
  webgpu: boolean;
  /** Why WebGPU is unavailable, when it is. */
  unavailableReason: string | null;
  vendor: string;
  architecture: string;
  description: string;
  isFallbackAdapter: boolean;
  maxBufferSizeMB: number | null;
  maxStorageBufferBindingSizeMB: number | null;
  maxComputeInvocationsPerWorkgroup: number | null;
  features: string[];
  deviceMemoryGB: number | null;
}

const MB = 1024 * 1024;

export async function detectGpu(): Promise<GpuInfo> {
  const deviceMemoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  const base: GpuInfo = {
    webgpu: false,
    unavailableReason: null,
    vendor: '',
    architecture: '',
    description: '',
    isFallbackAdapter: false,
    maxBufferSizeMB: null,
    maxStorageBufferBindingSizeMB: null,
    maxComputeInvocationsPerWorkgroup: null,
    features: [],
    deviceMemoryGB,
  };
  if (!('gpu' in navigator) || !navigator.gpu) {
    return { ...base, unavailableReason: 'This browser does not support WebGPU' };
  }
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (err) {
    return { ...base, unavailableReason: `WebGPU adapter request failed: ${String(err)}` };
  }
  if (!adapter) return { ...base, unavailableReason: 'No WebGPU adapter (GPU blocked or unsupported)' };
  const info = adapter.info;
  return {
    ...base,
    webgpu: true,
    vendor: info?.vendor ?? '',
    architecture: info?.architecture ?? '',
    description: info?.description ?? '',
    isFallbackAdapter: (info as GPUAdapterInfo & { isFallbackAdapter?: boolean })?.isFallbackAdapter ?? false,
    maxBufferSizeMB: adapter.limits.maxBufferSize / MB,
    maxStorageBufferBindingSizeMB: adapter.limits.maxStorageBufferBindingSize / MB,
    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
    features: [...adapter.features].sort(),
  };
}

/**
 * Quick check that WebGPU actually works, not just that it exists: create a
 * device, clear a small texture, and wait for the GPU. Some drivers and
 * sandboxes expose an adapter that fails on first use; those go to
 * compatibility mode (PLAN.md section 3.5).
 */
export async function webgpuSelfTest(timeoutMs = 4000): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!navigator.gpu) return { ok: false, reason: 'WebGPU is not supported by this browser' };
  const test = async (): Promise<void> => {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    try {
      // Render to a canvas context, since presenting is what fails on some setups.
      const canvas: OffscreenCanvas | HTMLCanvasElement =
        typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
      const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!context) throw new Error('No WebGPU canvas context');
      context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      const encoder = device.createCommandEncoder();
      encoder
        .beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] })
        .end();
      device.pushErrorScope('validation');
      device.queue.submit([encoder.finish()]);
      const error = await device.popErrorScope();
      if (error) throw new Error(error.message);
      await device.queue.onSubmittedWorkDone();
    } finally {
      device.destroy();
    }
  };
  try {
    await Promise.race([
      test(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('WebGPU did not respond in time')), timeoutMs)),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
