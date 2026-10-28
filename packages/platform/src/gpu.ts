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
