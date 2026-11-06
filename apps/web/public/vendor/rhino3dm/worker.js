/*
 * Reads Rhino .3dm files with rhino3dm (openNURBS compiled to WebAssembly)
 * and returns plain mesh data. rhino3dm generates code at runtime, so it
 * runs only here, in a worker with its own policy (see _headers); the
 * page sends the file's bytes and gets arrays back.
 */
/* global rhino3dm */
importScripts('rhino3dm.js');

const ready = rhino3dm();

// openNURBS unit systems → metres.
const UNITS = { 1: 1e-6, 2: 0.001, 3: 0.01, 4: 1, 5: 1000, 8: 0.0254, 9: 0.3048, 10: 1609.344, 12: 1e-10, 13: 1e-9, 14: 0.1, 15: 10, 16: 100, 17: 1e6 };

function meshData(rhino, mesh) {
  if (!mesh) return null;
  const json = mesh.toThreejsJSON();
  const a = json.data.attributes;
  return {
    position: a.position ? Float32Array.from(a.position.array) : null,
    normal: a.normal ? Float32Array.from(a.normal.array) : null,
    uv: a.uv ? Float32Array.from(a.uv.array) : null,
    color: a.color ? Float32Array.from(a.color.array) : null,
    index: json.data.index ? Uint32Array.from(json.data.index.array) : null,
  };
}

function meshesOf(rhino, geo) {
  const T = rhino.ObjectType;
  const out = [];
  const add = (m) => {
    const d = meshData(rhino, m);
    if (d && d.position && d.position.length) out.push(d);
  };
  switch (geo.objectType) {
    case T.Mesh:
      add(geo);
      break;
    case T.Brep: {
      const faces = geo.faces();
      for (let i = 0; i < faces.count; i++) {
        const face = faces.get(i);
        add(face.getMesh(rhino.MeshType.Any));
      }
      break;
    }
    case T.Extrusion:
      add(geo.getMesh(rhino.MeshType.Any));
      break;
    case T.SubD:
      try {
        add(rhino.Mesh.createFromSubDControlNet(geo));
      } catch {
        /* not available in this build */
      }
      break;
  }
  return out;
}

const hex = (c) => (c ? (c.r << 16) | (c.g << 8) | c.b : 0xcccccc);

self.onmessage = async (e) => {
  try {
    const rhino = await ready;
    const doc = rhino.File3dm.fromByteArray(new Uint8Array(e.data));
    if (!doc) throw new Error('This .3dm file couldn’t be read.');
    const unit = UNITS[doc.settings().modelUnitSystem.value ?? doc.settings().modelUnitSystem] ?? 1;
    const objects = doc.objects();
    const layers = doc.layers();
    const materials = doc.materials();
    const out = [];
    let skipped = 0;
    for (let i = 0; i < objects.count; i++) {
      const o = objects.get(i);
      const geo = o.geometry();
      const attrs = o.attributes();
      if (!attrs.visible) continue;
      const meshes = meshesOf(rhino, geo);
      if (!meshes.length) {
        skipped++;
        continue;
      }
      let color = 0xcccccc;
      const layer = attrs.layerIndex >= 0 ? layers.get(attrs.layerIndex) : null;
      if (attrs.materialIndex >= 0 && attrs.materialIndex < materials.count) color = hex(materials.get(attrs.materialIndex).diffuseColor);
      else if ((attrs.colorSource?.value ?? attrs.colorSource) === 1) color = hex(attrs.objectColor);
      else if (layer) color = hex(layer.color);
      out.push({ name: attrs.name || (layer && layer.name) || `Object ${i + 1}`, color, meshes });
    }
    const transfer = [];
    for (const o of out) for (const m of o.meshes) for (const k of Object.keys(m)) if (m[k]) transfer.push(m[k].buffer);
    self.postMessage({ objects: out, unit, skipped }, transfer);
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
