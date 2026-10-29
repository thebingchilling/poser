import type { ImportQuality } from './exportGlb';
import { optimiseGlb } from './optimise';

/** Import optimisation off the main thread (see optimise.ts). */
self.onmessage = async (e: MessageEvent<{ glb: ArrayBuffer; quality: ImportQuality }>) => {
  try {
    const result = await optimiseGlb(e.data.glb, e.data.quality);
    (self as unknown as Worker).postMessage(result, [result.glb]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
