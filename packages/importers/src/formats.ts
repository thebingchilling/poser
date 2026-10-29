/** Supported import formats (PLAN.md section 4.2). */
export type ModelFormat = 'gltf' | 'glb' | 'vrm' | 'fbx' | 'obj' | 'dae' | 'stl' | 'ply';
export type PoseFormat = 'bvh' | 'vrma' | 'pose-json';
export type ImageFormat = 'image' | 'hdr';

export type FileRole = { kind: 'model'; format: ModelFormat } | { kind: 'pose'; format: PoseFormat } | { kind: 'image'; format: ImageFormat } | { kind: 'other' };

export function classifyFile(path: string): FileRole {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'gltf':
    case 'glb':
    case 'vrm':
    case 'fbx':
    case 'obj':
    case 'dae':
    case 'stl':
    case 'ply':
      return { kind: 'model', format: ext };
    case 'bvh':
      return { kind: 'pose', format: 'bvh' };
    case 'vrma':
      return { kind: 'pose', format: 'vrma' };
    case 'json':
      return path.toLowerCase().endsWith('.pose.json') ? { kind: 'pose', format: 'pose-json' } : { kind: 'other' };
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'tif':
    case 'tiff':
      return { kind: 'image', format: 'image' };
    case 'hdr':
    case 'exr':
      return { kind: 'image', format: 'hdr' };
    default:
      return { kind: 'other' };
  }
}

/**
 * The files to import from a drop: every model and pose file (the import
 * wizard runs once per item). Textures and material files ride along.
 */
export function importableItems(paths: string[]): { path: string; role: FileRole }[] {
  const items = paths.map((path) => ({ path, role: classifyFile(path) })).filter((x) => x.role.kind === 'model' || x.role.kind === 'pose');
  // A .gltf and its .bin, or an .obj and .mtl, are one item: only the main file is listed.
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
