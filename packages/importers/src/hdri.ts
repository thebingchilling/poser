import { FloatType } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/**
 * HDRI environments (PLAN.md sections 4.2 and 18): .hdr (Radiance) and .exr
 * files become Library environments. The preview is tone-mapped (Reinhard,
 * then sRGB) into a small wide image.
 */
export interface HdriInfo {
  width: number;
  height: number;
  /** Small tone-mapped preview as RGBA bytes (2:1). */
  preview: { width: number; height: number; data: Uint8ClampedArray };
}

export function readHdri(buffer: ArrayBuffer, name: string): HdriInfo {
  const exr = /\.exr$/i.test(name);
  const parsed = (exr ? new EXRLoader().setDataType(FloatType) : new HDRLoader().setDataType(FloatType)).parse(buffer) as unknown as {
    width: number;
    height: number;
    data: Float32Array;
  };
  const { width, height, data } = parsed;
  if (!width || !height || !data) throw new Error('Could not read this HDR image.');
  const channels = Math.round(data.length / (width * height));
  const pw = 256;
  const ph = 128;
  const out = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      // HDR files are stored top row first; EXR from three comes bottom row first.
      const sy = Math.floor(((exr ? ph - 1 - y : y) / ph) * height);
      const i = (sy * width + Math.floor((x / pw) * width)) * channels;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c]!;
        const t = v / (1 + v);
        out[(y * pw + x) * 4 + c] = Math.round(255 * Math.pow(Math.max(0, t), 1 / 2.2));
      }
      out[(y * pw + x) * 4 + 3] = 255;
    }
  return { width, height, preview: { width: pw, height: ph, data: out } };
}
