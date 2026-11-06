import { DataTexture, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';

/**
 * Valve textures (.vtf) and materials (.vmt) for Source engine models.
 * Reads the full-size image of the first frame in the common formats
 * (DXT1/3/5 and the plain 8-bit layouts) into RGBA.
 */

/** The $basetexture (and $bumpmap) a .vmt names, without extension. */
export function parseVmt(text: string): { base?: string; bump?: string; translucent: boolean } {
  const get = (key: string) => new RegExp(`["']?\\$${key}["']?\\s+["']?([^"'\\n\\r]+)["']?`, 'i').exec(text)?.[1]?.trim();
  return { base: get('basetexture'), bump: get('bumpmap'), translucent: /\$(translucent|alphatest)["']?\s+["']?1/i.test(text) };
}

const enum Fmt {
  RGBA8888 = 0,
  ABGR8888 = 1,
  RGB888 = 2,
  BGR888 = 3,
  I8 = 5,
  IA88 = 6,
  ARGB8888 = 11,
  BGRA8888 = 12,
  DXT1 = 13,
  DXT3 = 14,
  DXT5 = 15,
  BGRX8888 = 16,
  DXT1_ONEBITALPHA = 20,
}

function byteSize(fmt: number, w: number, h: number): number {
  const blocks = Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4));
  switch (fmt) {
    case Fmt.DXT1:
    case Fmt.DXT1_ONEBITALPHA:
      return blocks * 8;
    case Fmt.DXT3:
    case Fmt.DXT5:
      return blocks * 16;
    case Fmt.RGB888:
    case Fmt.BGR888:
      return w * h * 3;
    case Fmt.I8:
      return w * h;
    case Fmt.IA88:
      return w * h * 2;
    case Fmt.RGBA8888:
    case Fmt.ABGR8888:
    case Fmt.ARGB8888:
    case Fmt.BGRA8888:
    case Fmt.BGRX8888:
      return w * h * 4;
    default:
      return -1;
  }
}

function rgb565(c: number): [number, number, number] {
  return [((c >> 11) & 31) * (255 / 31), ((c >> 5) & 63) * (255 / 63), (c & 31) * (255 / 31)];
}

function decodeDxt(src: Uint8Array, w: number, h: number, fmt: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  const bw = Math.max(1, Math.ceil(w / 4));
  const bh = Math.max(1, Math.ceil(h / 4));
  const blockBytes = fmt === Fmt.DXT3 || fmt === Fmt.DXT5 ? 16 : 8;
  let o = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++, o += blockBytes) {
      const alpha = new Uint8Array(16).fill(255);
      let c = o;
      if (fmt === Fmt.DXT3) {
        for (let i = 0; i < 8; i++) (alpha[i * 2] = (src[o + i]! & 15) * 17), (alpha[i * 2 + 1] = (src[o + i]! >> 4) * 17);
        c = o + 8;
      } else if (fmt === Fmt.DXT5) {
        const a0 = src[o]!;
        const a1 = src[o + 1]!;
        const table = [a0, a1];
        for (let i = 1; i < (a0 > a1 ? 7 : 5); i++) table.push(a0 > a1 ? ((7 - i) * a0 + i * a1) / 7 : ((5 - i) * a0 + i * a1) / 5);
        if (a0 <= a1) table.push(0, 255);
        // Reorder: codes 2.. map to the interpolated values.
        const codes = [a0, a1, ...table.slice(2)];
        let bits = 0n;
        for (let i = 0; i < 6; i++) bits |= BigInt(src[o + 2 + i]!) << BigInt(8 * i);
        for (let i = 0; i < 16; i++) alpha[i] = codes[Number((bits >> BigInt(3 * i)) & 7n)]!;
        c = o + 8;
      }
      const c0 = src[c]! | (src[c + 1]! << 8);
      const c1 = src[c + 2]! | (src[c + 3]! << 8);
      const p0 = rgb565(c0);
      const p1 = rgb565(c1);
      const four = c0 > c1 || fmt !== Fmt.DXT1;
      const pal: [number, number, number, number][] = [
        [...p0, 255],
        [...p1, 255],
        four ? [(2 * p0[0] + p1[0]) / 3, (2 * p0[1] + p1[1]) / 3, (2 * p0[2] + p1[2]) / 3, 255] : [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, 255],
        four ? [(p0[0] + 2 * p1[0]) / 3, (p0[1] + 2 * p1[1]) / 3, (p0[2] + 2 * p1[2]) / 3, 255] : [0, 0, 0, 0],
      ];
      const bits = src[c + 4]! | (src[c + 5]! << 8) | (src[c + 6]! << 16) | (src[c + 7]! << 24);
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i % 4);
        const y = by * 4 + Math.floor(i / 4);
        if (x >= w || y >= h) continue;
        const p = pal[(bits >>> (2 * i)) & 3]!;
        const d = (y * w + x) * 4;
        out[d] = p[0];
        out[d + 1] = p[1];
        out[d + 2] = p[2];
        out[d + 3] = fmt === Fmt.DXT1 ? p[3] : alpha[i]!;
      }
    }
  return out;
}

function toRgba(src: Uint8Array, w: number, h: number, fmt: number): Uint8Array {
  if (fmt === Fmt.DXT1 || fmt === Fmt.DXT1_ONEBITALPHA || fmt === Fmt.DXT3 || fmt === Fmt.DXT5) return decodeDxt(src, w, h, fmt === Fmt.DXT1_ONEBITALPHA ? Fmt.DXT1 : fmt);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const d = i * 4;
    switch (fmt) {
      case Fmt.RGBA8888:
        out.set(src.subarray(d, d + 4), d);
        break;
      case Fmt.ABGR8888:
        out.set([src[d + 3]!, src[d + 2]!, src[d + 1]!, src[d]!], d);
        break;
      case Fmt.ARGB8888:
        out.set([src[d + 1]!, src[d + 2]!, src[d + 3]!, src[d]!], d);
        break;
      case Fmt.BGRA8888:
        out.set([src[d + 2]!, src[d + 1]!, src[d]!, src[d + 3]!], d);
        break;
      case Fmt.BGRX8888:
        out.set([src[d + 2]!, src[d + 1]!, src[d]!, 255], d);
        break;
      case Fmt.RGB888:
        out.set([src[i * 3]!, src[i * 3 + 1]!, src[i * 3 + 2]!, 255], d);
        break;
      case Fmt.BGR888:
        out.set([src[i * 3 + 2]!, src[i * 3 + 1]!, src[i * 3]!, 255], d);
        break;
      case Fmt.I8:
        out.set([src[i]!, src[i]!, src[i]!, 255], d);
        break;
      case Fmt.IA88:
        out.set([src[i * 2]!, src[i * 2]!, src[i * 2]!, src[i * 2 + 1]!], d);
        break;
    }
  }
  return out;
}

export function parseVtf(buffer: ArrayBuffer): { width: number; height: number; rgba: Uint8Array } {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 64 || dv.getUint32(0, true) !== 0x00465456) throw new Error('Not a VTF texture.');
  const width = dv.getUint16(16, true);
  const height = dv.getUint16(18, true);
  const flags = dv.getUint32(20, true);
  const frames = Math.max(1, dv.getUint16(24, true));
  const fmt = dv.getInt32(52, true);
  const size = byteSize(fmt, width, height);
  if (size < 0) throw new Error(`VTF format ${fmt} isn’t supported.`);
  // Environment maps hold 6 faces; everything else 1. The full-size mip is stored last.
  const faces = flags & 0x4000 ? 6 : 1;
  const start = buffer.byteLength - size * frames * faces;
  if (start < 0) throw new Error('This VTF texture is damaged.');
  return { width, height, rgba: toRgba(new Uint8Array(buffer, start, size), width, height, fmt) };
}

export function vtfTexture(buffer: ArrayBuffer): DataTexture {
  const { width, height, rgba } = parseVtf(buffer);
  const tex = new DataTexture(rgba, width, height, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  // Source textures are stored top row first, like the model's UVs expect.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
