import type { ImportQuality } from './exportGlb';

/**
 * The page's side of import optimisation (optimise.ts runs in a Web Worker,
 * so its libraries never load on the main thread).
 */

/** Triangle budget per import quality (whole model). */
export const TRIANGLE_LIMITS: Record<ImportQuality, number> = { high: Infinity, balanced: 400_000, light: 120_000 };

export interface OptimiseReport {
  trianglesBefore: number;
  trianglesAfter: number;
  /** Names of morphs removed because they move nothing. */
  removedMorphs: string[];
  /** Morph names left in the model. */
  morphNames: string[];
  bytesBefore: number;
  bytesAfter: number;
}

/** Optimises a converted GLB in a Web Worker. */
export function optimiseInWorker(glb: ArrayBuffer, quality: ImportQuality): Promise<{ glb: ArrayBuffer; report: OptimiseReport }> {
  // Without workers the import keeps the unoptimised model (the caller falls back).
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Web Workers are not available'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./optimise.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ glb?: ArrayBuffer; report?: OptimiseReport; error?: string }>) => {
      worker.terminate();
      if (e.data.error || !e.data.glb || !e.data.report) reject(new Error(e.data.error ?? 'Optimisation failed'));
      else resolve({ glb: e.data.glb, report: e.data.report });
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The optimisation worker failed'));
    };
    worker.postMessage({ glb, quality }, [glb]);
  });
}
