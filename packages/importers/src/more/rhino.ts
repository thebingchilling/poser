import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';

/**
 * Rhino models (.3dm) through rhino3dm in its own worker
 * (apps/web/public/vendor/rhino3dm/worker.js). Meshes, and the render
 * meshes Rhino saves with surfaces and solids, come through with object,
 * layer, or material colours; curves and surfaces saved without render
 * meshes are skipped. Rhino is Z-up; models come out Y-up in metres.
 */

interface RhinoMesh {
  position: Float32Array | null;
  normal: Float32Array | null;
  uv: Float32Array | null;
  color: Float32Array | null;
  index: Uint32Array | null;
}

export async function loadRhino(buffer: ArrayBuffer, workerUrl = '/vendor/rhino3dm/worker.js'): Promise<{ root: Group; warnings: string[] }> {
  if (typeof Worker === 'undefined') throw new Error('Rhino files need Web Workers, which aren’t available here.');
  const result = await new Promise<{ objects: { name: string; color: number; meshes: RhinoMesh[] }[]; unit: number; skipped: number }>((resolve, reject) => {
    const worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'The Rhino reader failed to start.'));
    };
    worker.postMessage(buffer, [buffer]);
  });
  const warnings: string[] = [];
  if (result.skipped) warnings.push(`${result.skipped} curves, points, or surfaces saved without render meshes were skipped.`);
  const root = new Group();
  // Z-up → Y-up.
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(result.unit);
  for (const o of result.objects) {
    const material = new MeshStandardMaterial({ name: o.name, color: o.color, roughness: 0.6, side: DoubleSide });
    for (const m of o.meshes) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(m.position!, 3));
      if (m.normal) g.setAttribute('normal', new BufferAttribute(m.normal, 3));
      if (m.uv) g.setAttribute('uv', new BufferAttribute(m.uv, 2));
      if (m.index) g.setIndex(new BufferAttribute(m.index, 1));
      if (!m.normal) g.computeVertexNormals();
      const mesh = new Mesh(g, material);
      mesh.name = o.name;
      root.add(mesh);
    }
  }
  if (!root.children.length) throw new Error('This Rhino file has no meshes to import: its surfaces were saved without render meshes.');
  const wrap = new Group();
  wrap.add(root);
  return { root: wrap, warnings };
}
