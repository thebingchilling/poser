import { chooseQuality, currentBrowser, detectGpu, logError, runGpuBenchmark, webgpuSelfTest } from '@poser/platform';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';

/**
 * GPU auto-detection (PLAN.md section 3.5): read what the browser reports,
 * run the short benchmark, pick a level, and store it for this device.
 */
export async function runQualityDetection() {
  const gpu = await detectGpu();
  useUi.getState().set({ gpu });
  let benchmarkMs: number | null = null;
  // An adapter that fails on first use counts as no WebGPU.
  const works = gpu.webgpu && (await webgpuSelfTest()).ok;
  if (works) {
    try {
      benchmarkMs = await runGpuBenchmark();
    } catch (err) {
      logError(err, 'benchmark');
    }
  }
  const { level, capable } = chooseQuality({
    isMobile: currentBrowser().isMobile,
    webgpu: works,
    deviceMemoryGB: gpu.deviceMemoryGB,
    maxBufferSizeMB: gpu.maxBufferSizeMB,
    benchmarkMs,
  });
  useSettings.getState().set({ detectedQuality: level, capableQuality: capable, benchmarkMs });
  return { level, capable, benchmarkMs, gpu };
}
