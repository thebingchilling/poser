import type { QualityLevel } from '@poser/core';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'full'];

export const QUALITY_LABELS: Record<QualityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  full: 'Full',
};

/** Per-level settings that systems read. Later phases add their own fields. */
export interface QualitySettings {
  /** Render resolution as a fraction of device pixels. */
  pixelRatioScale: number;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  /** GPU memory budget in MB (memory manager). */
  gpuMemoryBudgetMB: number;
  maxTextureSize: number;
}

export const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioScale: 0.6, maxPixelRatio: 1, shadows: false, shadowMapSize: 512, antialias: false, gpuMemoryBudgetMB: 512, maxTextureSize: 1024 },
  medium: { pixelRatioScale: 0.8, maxPixelRatio: 1.5, shadows: true, shadowMapSize: 1024, antialias: false, gpuMemoryBudgetMB: 1024, maxTextureSize: 2048 },
  high: { pixelRatioScale: 1, maxPixelRatio: 2, shadows: true, shadowMapSize: 2048, antialias: true, gpuMemoryBudgetMB: 1536, maxTextureSize: 4096 },
  full: { pixelRatioScale: 1, maxPixelRatio: 3, shadows: true, shadowMapSize: 4096, antialias: true, gpuMemoryBudgetMB: 2048, maxTextureSize: 4096 },
};

export function stepQuality(level: QualityLevel, delta: number): QualityLevel {
  const i = QUALITY_LEVELS.indexOf(level);
  const next = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, i + delta));
  return QUALITY_LEVELS[next]!;
}

export interface DeviceProfile {
  isMobile: boolean;
  webgpu: boolean;
  /** navigator.deviceMemory in GB, if the browser reports it (capped at 8 by Chrome). */
  deviceMemoryGB: number | null;
  /** Adapter limit, a rough proxy for GPU class. */
  maxBufferSizeMB: number | null;
  /** Milliseconds per benchmark iteration; lower is faster. null if not run. */
  benchmarkMs: number | null;
}

/**
 * Benchmark time (ms per iteration of the standard workload, see benchmark.ts)
 * at or below which each level stays smooth. Tuned on the owner's devices.
 */
export const BENCHMARK_THRESHOLDS: Record<Exclude<QualityLevel, 'low'>, number> = {
  full: 4,
  high: 8,
  medium: 16,
};

/**
 * Pick a default quality level (PLAN.md section 3.5): Full on computers unless
 * the GPU looks weak, reduced (Low/Medium) on phones and tablets. Returns the
 * default plus the highest level the device seems able to handle, so mobile
 * users can be told they could raise it.
 */
export function chooseQuality(profile: DeviceProfile): { level: QualityLevel; capable: QualityLevel } {
  if (!profile.webgpu) return { level: 'low', capable: 'low' };

  let capable: QualityLevel;
  if (profile.benchmarkMs !== null) {
    const ms = profile.benchmarkMs;
    capable = ms <= BENCHMARK_THRESHOLDS.full ? 'full' : ms <= BENCHMARK_THRESHOLDS.high ? 'high' : ms <= BENCHMARK_THRESHOLDS.medium ? 'medium' : 'low';
  } else {
    capable = profile.isMobile ? 'medium' : 'full';
  }
  if (profile.deviceMemoryGB !== null && profile.deviceMemoryGB < 4) capable = minLevel(capable, 'medium');

  const level = profile.isMobile ? minLevel(capable, 'medium') : capable;
  return { level, capable };
}

function minLevel(a: QualityLevel, b: QualityLevel): QualityLevel {
  return QUALITY_LEVELS.indexOf(a) < QUALITY_LEVELS.indexOf(b) ? a : b;
}
