/** Supported import formats (PLAN.md section 4.2). */
export type ModelFormat =
  | 'gltf' | 'glb' | 'vrm' | 'fbx' | 'obj' | 'dae' | 'stl' | 'ply'
  | '3ds' | '3mf' | 'amf' | 'usd' | 'usda' | 'usdc' | 'usdz' | 'lwo' | 'kmz' | 'md2' | 'vtk' | 'vtp' | 'vox'
  | 'duf' | 'dsf'
  | 'vap' | 'vamscene' | 'vamitem';
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
    case '3ds':
    case '3mf':
    case 'amf':
    case 'usd':
    case 'usda':
    case 'usdc':
    case 'usdz':
    case 'lwo':
    case 'kmz':
    case 'md2':
    case 'vtk':
    case 'vtp':
    case 'vox':
    case 'duf':
    case 'dsf':
      return { kind: 'model', format: ext };
    case 'bvh':
      return { kind: 'pose', format: 'bvh' };
    case 'vrma':
      return { kind: 'pose', format: 'vrma' };
    case 'json':
      if (path.toLowerCase().endsWith('.pose.json')) return { kind: 'pose', format: 'pose-json' };
      // VaM scenes (Saves/scene/…json) hold people with their looks.
      if (/(^|\/)saves\/scene\//i.test(path)) return { kind: 'model', format: 'vamscene' };
      return { kind: 'other' };
    case 'vap':
      return { kind: 'model', format: 'vap' };
    case 'vam':
      return { kind: 'model', format: 'vamitem' };
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
  // HDR images import as environments (image-based lighting); ordinary images are textures that ride along.
  let items = paths.map((path) => ({ path, role: classifyFile(path) })).filter((x) => x.role.kind === 'model' || x.role.kind === 'pose' || (x.role.kind === 'image' && x.role.format === 'hdr'));
  // Daz: scenes (.duf) are what get imported; the .dsf assets they use come along as dependencies.
  if (items.some((x) => x.role.kind === 'model' && x.role.format === 'duf')) items = items.filter((x) => !(x.role.kind === 'model' && x.role.format === 'dsf'));
  // A .gltf and its .bin, or an .obj and .mtl, are one item: only the main file is listed.
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
