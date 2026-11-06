/** Supported import formats (PLAN.md section 4.2). */
export type ModelFormat =
  | 'gltf' | 'glb' | 'vrm' | 'fbx' | 'obj' | 'dae' | 'stl' | 'ply'
  | '3ds' | '3mf' | 'amf' | 'usd' | 'usda' | 'usdc' | 'usdz' | 'lwo' | 'kmz' | 'md2' | 'vtk' | 'vtp' | 'vox'
  | 'duf' | 'dsf'
  | 'vap' | 'vamscene' | 'vamitem'
  | 'ldr' | 'mpd' | 'pcd' | 'xyz' | 'off' | 'x' | 'wrl' | 'x3d' | 'x3dv' | 'pmx' | 'pmd' | 'xps' | 'mesh' | 'ascii' | 'smd' | 'mdl' | 'cr2' | 'pz3' | 'pp2' | 'hr2' | 'crz' | 'pzz' | 'ppz' | 'hrz' | 'blend' | '3dm';
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
    case 'ldr':
    case 'mpd':
    case 'pcd':
    case 'xyz':
    case 'off':
    case 'x':
    case 'wrz':
      return { kind: 'model', format: 'wrl' };
    case 'wrl':
    case 'x3d':
    case 'x3dv':
    case 'pmx':
    case 'pmd':
    case 'xps':
    case 'smd':
    case 'cr2':
    case 'pz3':
    case 'pp2':
    case 'hr2':
    case 'crz':
    case 'pzz':
    case 'ppz':
    case 'hrz':
    case 'blend':
    case '3dm':
      return { kind: 'model', format: ext };
    case 'mdl':
      // Source engine models (the .vvd/.vtx beside them hold the mesh); Quake .mdl files have no .vvd and are reported then.
      return { kind: 'model', format: 'mdl' };
    case 'mesh':
      // XNALara binary meshes (generic_item.mesh); .mesh.ascii is the text form.
      return { kind: 'model', format: 'mesh' };
    case 'ascii':
      return path.toLowerCase().endsWith('.mesh.ascii') ? { kind: 'model', format: 'ascii' } : { kind: 'other' };

    case 'bvh':
      return { kind: 'pose', format: 'bvh' };
    case 'vrma':
      return { kind: 'pose', format: 'vrma' };
    case 'json':
      if (path.toLowerCase().endsWith('.pose.json')) return { kind: 'pose', format: 'pose-json' };
      // VaM scenes (Saves/scene/…json) hold people with their looks.
      if (/(^|\/)saves\/scene\//i.test(path)) return { kind: 'model', format: 'vamscene' };
      // Older VaM looks: Saves/Person/appearance (or full) presets.
      if (/(^|\/)saves\/person\/(appearance|full)\//i.test(path)) return { kind: 'model', format: 'vap' };
      return { kind: 'other' };
    case 'vap':
      // Only appearance (look) presets are people; others tune a part (pose, skin, morphs, a clothing item's materials).
      if (/(^|\/)custom\/(clothing|hair|assets|scripts)\//i.test(path) || /(^|\/)custom\/atom\/person\/(?!appearance\/|general\/)/i.test(path)) return { kind: 'other' };
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

/** Formats saved by one program for its own use, which no other program can read. */
const PROPRIETARY: Record<string, string> = {
  max: '3ds Max scenes (.max)',
  c4d: 'Cinema 4D scenes (.c4d)',
  ma: 'Maya scenes (.ma)',
  mb: 'Maya scenes (.mb)',
  skp: 'SketchUp models (.skp)',
  ztl: 'ZBrush tools (.ztl)',
  zpr: 'ZBrush projects (.zpr)',
  hip: 'Houdini scenes (.hip)',
  hipnc: 'Houdini scenes (.hipnc)',
  lxo: 'Modo scenes (.lxo)',
  mud: 'Mudbox scenes (.mud)',
  spp: 'Substance Painter projects (.spp)',
  '3dc': '3D-Coat scenes (.3dc)',
  hda: 'Houdini assets (.hda)',
  iclone: 'iClone projects',
  ccproject: 'Character Creator projects (.ccProject)',
  iavatar: 'iClone avatars (.iAvatar)',
  ichr: 'Character Creator characters (.iChr)',
  hcf: 'Honey Select cards',
  assetbundle: 'Unity asset bundles (.assetbundle)',
  unity3d: 'Unity web player bundles (.unity3d)',
  uasset: 'Unreal assets (.uasset)',
  upk: 'Unreal packages (.upk)',
};

/**
 * Plain-language notes on files in a drop that won't be imported, so
 * nothing disappears silently: what they are and why they're left out.
 */
export function explainSkipped(paths: string[]): string[] {
  const groups = new Map<string, number>();
  const bump = (note: string) => groups.set(note, (groups.get(note) ?? 0) + 1);
  for (const path of paths) {
    const lower = path.toLowerCase();
    const name = lower.split('/').pop()!;
    const ext = name.includes('.') ? name.split('.').pop()! : '';
    const role = classifyFile(path);
    if (role.kind !== 'other' && !(role.kind === 'image' && role.format === 'image')) continue;
    if (role.kind === 'image') bump('Images: used as textures by the models that need them');
    else if (ext === 'vmi' || ext === 'vmb' || ext === 'dsf') bump(ext === 'dsf' ? 'Daz library files: used by the Daz scenes that need them' : 'VaM morphs: used automatically by looks that need them');
    else if (ext === 'vap') bump('VaM presets for poses, skin, morphs, or an item’s materials: not people or models on their own');
    else if (ext === 'vaj' || ext === 'vab') bump('VaM clothing and hair parts: imported through their .vam file');
    else if (name === 'meta.json') bump('Package information (meta.json): read with the package');
    else if (PROPRIETARY[ext]) bump(`${PROPRIETARY[ext]}: saved in a private format that only that program can read`);
    else if (/^(cs|cslist|dll|js|py|exe|bat)$/.test(ext)) bump('Plugins and scripts: not models');
    else if (/^(mp3|wav|ogg|m4a|flac|mp4|webm|mov|avi)$/.test(ext)) bump('Sound and video: not models');
    else if (/^(txt|md|pdf|html?|url|rtf|nfo|jpg_|db|ini)$/.test(ext) || /readme|licen[cs]e/.test(name)) bump('Read-me and documents');
    else if (ext === 'json' || ext === 'vac' || ext === 'vajson') bump('Settings and data files');
    else if (/^(vvd|vtx|phy|ani)$/.test(ext)) bump('Source model parts: read with their .mdl');
    else if (/^(vmt|vtf)$/.test(ext)) bump('Source materials and textures: used by the models that need them');
    else if (/^(sph|spa|bmp|dds|tga)$/.test(ext)) bump('Textures: used by the models that need them');
    else if (/^(mtl|bin|mat)$/.test(ext)) bump('Material and data files: used by the models that need them');
    else if (/^(meta|prefab|controller|anim|asset|shader|cginc)$/.test(ext)) bump('Unity project files: not models');
    else bump(ext ? `.${ext} files: not a 3D format this app can read` : 'Files without a type: not recognised');
  }
  return [...groups].map(([note, n]) => `${n} × ${note}`);
}
