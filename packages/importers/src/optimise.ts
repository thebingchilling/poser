import { WebIO, type Accessor, type Document, type Primitive } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import type { ImportQuality } from './exportGlb';
import { TRIANGLE_LIMITS, type OptimiseReport } from './optimiseClient';

/**
 * Mesh optimisation after conversion (PLAN.md section 4.3), run in a Web
 * Worker during import (optimiseClient.ts): remove morphs that move nothing,
 * weld identical vertices, and simplify meshes above the quality level's
 * triangle budget, then drop vertices nothing uses. Textures are already
 * downscaled to the level's size limit when the GLB is written.
 *
 * Only @gltf-transform/core is used: its helper library pulls in code that
 * compiles functions at runtime, which the app's Content Security Policy
 * (rightly) blocks.
 */

/** Morphs whose largest vertex offset is below this (metres) do nothing visible. */
const EMPTY_MORPH = 1e-5;

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const idx = prim.getIndices();
      n += (idx ? idx.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
    }
  return Math.round(n);
}

/** Largest absolute component across a morph target's position offsets. */
function targetSize(target: { getAttribute(name: string): { getCount(): number; getElement(i: number, out: number[]): number[] } | null }): number {
  const pos = target.getAttribute('POSITION');
  if (!pos) return 0;
  let max = 0;
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    max = Math.max(max, Math.abs(v[0]!), Math.abs(v[1]!), Math.abs(v[2]!));
  }
  return max;
}

/** Removes morph targets that are empty on every primitive of a mesh; returns their names. */
function dropEmptyMorphs(doc: Document): string[] {
  const removed: string[] = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    const prims = mesh.listPrimitives();
    const count = Math.max(0, ...prims.map((p) => p.listTargets().length));
    if (!count) continue;
    // glTF-Transform reads morph names (extras.targetNames) onto the targets and writes them back from there.
    const names = Array.from({ length: count }, (_, t) => prims.map((p) => p.listTargets()[t]?.getName()).find((n) => n) ?? '');
    const keep: number[] = [];
    for (let t = 0; t < count; t++) {
      const size = Math.max(0, ...prims.map((p) => (p.listTargets()[t] ? targetSize(p.listTargets()[t]!) : 0)));
      if (size >= EMPTY_MORPH) keep.push(t);
      else removed.push(names[t] || `${mesh.getName() || 'mesh'} morph ${t}`);
    }
    if (keep.length === count) continue;
    for (const p of prims) {
      const targets = p.listTargets();
      targets.forEach((target, t) => {
        if (!keep.includes(t)) {
          p.removeTarget(target);
          for (const sem of target.listSemantics()) target.getAttribute(sem)?.dispose();
          target.dispose();
        }
      });
    }
    const weights = mesh.getWeights();
    mesh.setWeights(keep.map((t) => weights[t] ?? 0));
  }
  return removed;
}

function morphNames(doc: Document): string[] {
  const names = new Set<string>();
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) for (const t of p.listTargets()) if (t.getName()) names.add(t.getName());
  return [...names];
}

/** Every accessor a primitive's vertices use: attributes and morph-target attributes. */
function vertexAccessors(p: Primitive): Accessor[] {
  return [...p.listAttributes(), ...p.listTargets().flatMap((t) => t.listAttributes())];
}

/**
 * Rebuilds a primitive's vertex data keeping only `order` (old vertex
 * indices, in new order) and gives it `indices` in the new numbering.
 */
function rebuildPrimitive(doc: Document, p: Primitive, order: number[], indices: Uint32Array): void {
  const buffer = doc.getRoot().listBuffers()[0];
  const remake = (acc: Accessor): Accessor => {
    const size = acc.getElementSize();
    const src = acc.getArray()!;
    const Ctor = src.constructor as new (n: number) => typeof src;
    const out = new Ctor(order.length * size);
    order.forEach((v, i) => {
      for (let k = 0; k < size; k++) out[i * size + k] = src[v * size + k]!;
    });
    const next = doc.createAccessor(acc.getName()).setType(acc.getType()).setArray(out).setNormalized(acc.getNormalized());
    if (buffer) next.setBuffer(buffer);
    return next;
  };
  for (const sem of p.listSemantics()) {
    const old = p.getAttribute(sem)!;
    p.setAttribute(sem, remake(old));
    if (!old.listParents().some((x) => x !== doc.getRoot())) old.dispose();
  }
  for (const t of p.listTargets())
    for (const sem of t.listSemantics()) {
      const old = t.getAttribute(sem)!;
      t.setAttribute(sem, remake(old));
      if (!old.listParents().some((x) => x !== doc.getRoot())) old.dispose();
    }
  const oldIndices = p.getIndices();
  const idx = doc.createAccessor().setType('SCALAR').setArray(order.length > 65535 ? indices : new Uint16Array(indices));
  if (buffer) idx.setBuffer(buffer);
  p.setIndices(idx);
  if (oldIndices && !oldIndices.listParents().some((x) => x !== doc.getRoot())) oldIndices.dispose();
}

function primitiveIndices(p: Primitive): Uint32Array {
  const idx = p.getIndices();
  if (idx) return Uint32Array.from(idx.getArray()!);
  return Uint32Array.from({ length: p.getAttribute('POSITION')!.getCount() }, (_, i) => i);
}

/** Merges vertices whose every attribute (and morph offset) is identical. */
function weldPrimitive(doc: Document, p: Primitive): void {
  const count = p.getAttribute('POSITION')?.getCount() ?? 0;
  if (!count) return;
  const accessors = vertexAccessors(p);
  const firstOf = new Map<string, number>();
  const remap = new Uint32Array(count);
  const order: number[] = [];
  const el: number[] = [];
  for (let v = 0; v < count; v++) {
    let key = '';
    for (const a of accessors) key += a.getElement(v, el).join(',') + '|';
    let to = firstOf.get(key);
    if (to === undefined) {
      to = order.length;
      firstOf.set(key, to);
      order.push(v);
    }
    remap[v] = to;
  }
  if (order.length === count && p.getIndices()) return;
  const indices = primitiveIndices(p).map((i) => remap[i]!);
  rebuildPrimitive(doc, p, order, indices);
}

/** Simplifies a primitive to about `ratio` of its triangles, then drops unused vertices. */
function simplifyPrimitive(doc: Document, p: Primitive, ratio: number): void {
  const pos = p.getAttribute('POSITION');
  if (!pos || ratio >= 1) return;
  const indices = primitiveIndices(p);
  const positions = Float32Array.from(pos.getArray()!);
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
  // Borders stay locked so seams between clothing and skin, and UV islands, don't open.
  const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.002, ['LockBorder']);
  const used = new Map<number, number>();
  const order: number[] = [];
  const next = new Uint32Array(simplified.length);
  simplified.forEach((v, i) => {
    let to = used.get(v);
    if (to === undefined) {
      to = order.length;
      used.set(v, to);
      order.push(v);
    }
    next[i] = to;
  });
  rebuildPrimitive(doc, p, order, next);
}

export async function optimiseGlb(glb: ArrayBuffer, quality: ImportQuality, limit = TRIANGLE_LIMITS[quality]): Promise<{ glb: ArrayBuffer; report: OptimiseReport }> {
  const io = new WebIO();
  const doc = await io.readBinary(new Uint8Array(glb));
  const trianglesBefore = countTriangles(doc);
  const removedMorphs = dropEmptyMorphs(doc);
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMode() === 4);
  for (const p of prims) weldPrimitive(doc, p);
  const welded = countTriangles(doc);
  if (welded > limit) {
    await MeshoptSimplifier.ready;
    for (const p of prims) simplifyPrimitive(doc, p, limit / welded);
  }
  const out = await io.writeBinary(doc);
  const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  return {
    glb: bytes,
    report: { trianglesBefore, trianglesAfter: countTriangles(doc), removedMorphs, morphNames: morphNames(doc), bytesBefore: glb.byteLength, bytesAfter: bytes.byteLength },
  };
}
