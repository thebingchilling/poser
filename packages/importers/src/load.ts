import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Group, LoadingManager, Mesh, MeshStandardMaterial, type AnimationClip, type BufferGeometry, type Object3D } from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { LWOLoader } from 'three/addons/loaders/LWOLoader.js';
import { KMZLoader } from 'three/addons/loaders/KMZLoader.js';
import { MD2Loader } from 'three/addons/loaders/MD2Loader.js';
import { VTKLoader } from 'three/addons/loaders/VTKLoader.js';
import { VOXLoader, buildMesh } from 'three/addons/loaders/VOXLoader.js';
import { MissingContentError, VirtualFilesSource, contentSources } from './content';
import { buildDaz } from './daz/build';
import { DsonResolver, parseDson } from './daz/dson';
import type { VirtualFiles } from './files';
import type { ModelFormat } from './formats';

export interface LoadedModel {
  root: Object3D;
  animations: AnimationClip[];
  /** Canonical (VRM humanoid) bone name → node name, for VRM files. */
  vrmHumanoid?: Record<string, string>;
  warnings: string[];
}

/** How long to wait for a model's textures before importing without the stragglers. */
const TEXTURE_WAIT_MS = 30_000;

/**
 * Loads a model with the matching three.js loader (PLAN.md section 4.2).
 * Every external reference (textures, .bin, .mtl) is looked up in the
 * virtual folder, so imports work from loose files, folders, or zips.
 * Resolves once the model and its textures have loaded.
 */
export async function loadModel(vfs: VirtualFiles, path: string, format: ModelFormat): Promise<LoadedModel> {
  const warnings: string[] = [];
  const manager = new LoadingManager();
  // Loaders return before their textures finish loading; track the manager until it goes idle.
  let started = false;
  let done = false;
  let markIdle = () => {};
  const idle = new Promise<void>((resolve) => (markIdle = resolve));
  manager.onStart = () => (started = true);
  manager.onLoad = () => {
    done = true;
    markIdle();
  };
  manager.onError = (url) => warnings.push(`Could not load ${url.split('/').pop()}`);
  manager.setURLModifier((url) => {
    if (url.startsWith('data:')) return url;
    // Blob URLs from the main file arrive as blob:<origin>/<name>; look up the name.
    const ref = url.startsWith('blob:') ? url.slice(url.lastIndexOf('/') + 1) : url;
    const found = vfs.resolve(ref, path);
    if (!found) {
      warnings.push(`Missing file: ${ref.split(/[\\/]/).pop()}`);
      return url;
    }
    return vfs.url(found)!;
  });

  const model = await parse(vfs, path, format, manager, warnings);
  if (started && !done) await Promise.race([idle, new Promise((r) => setTimeout(r, TEXTURE_WAIT_MS))]);
  return model;
}

function plainMesh(geometry: BufferGeometry): Group {
  const material = new MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.7, vertexColors: geometry.hasAttribute('color') });
  const g = new Group();
  g.add(new Mesh(geometry, material));
  return g;
}

async function parse(vfs: VirtualFiles, path: string, format: ModelFormat, manager: LoadingManager, warnings: string[]): Promise<LoadedModel> {
  const blob = vfs.get(path);
  if (!blob) throw new Error(`File not found: ${path}`);
  const buffer = await blob.arrayBuffer();
  const text = () => new TextDecoder().decode(buffer);

  switch (format) {
    case 'glb':
    case 'gltf':
    case 'vrm': {
      const loader = new GLTFLoader(manager);
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.parseAsync(format === 'gltf' ? text() : buffer, '');
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (vrm) {
        // VRM 0.x avatars face -Z; turn them to face +Z like everything else.
        VRMUtils.rotateVRM0(vrm);
        const humanoid: Record<string, string> = {};
        for (const [name, bone] of Object.entries(vrm.humanoid.rawHumanBones)) if (bone?.node) humanoid[name] = bone.node.name;
        return { root: vrm.scene, animations: gltf.animations, vrmHumanoid: humanoid, warnings };
      }
      return { root: gltf.scene, animations: gltf.animations, warnings };
    }
    case 'fbx': {
      const root = new FBXLoader(manager).parse(buffer, '');
      return { root, animations: root.animations ?? [], warnings };
    }
    case 'obj': {
      const objText = text();
      const loader = new OBJLoader(manager);
      const mtlRef = /^mtllib\s+(.+)$/m.exec(objText)?.[1]?.trim();
      if (mtlRef) {
        const mtlPath = vfs.resolve(mtlRef, path);
        if (mtlPath) {
          const materials = new MTLLoader(manager).parse(await vfs.get(mtlPath)!.text(), '');
          materials.preload();
          loader.setMaterials(materials);
        } else warnings.push(`Missing material file: ${mtlRef}`);
      }
      return { root: loader.parse(objText), animations: [], warnings };
    }
    case 'dae': {
      const collada = new ColladaLoader(manager).parse(text(), '');
      if (!collada) throw new Error('Could not read this Collada file');
      return { root: collada.scene, animations: collada.scene.animations ?? [], warnings };
    }
    case 'stl':
    case 'ply':
    case 'vtk':
    case 'vtp': {
      const geometry = format === 'stl' ? new STLLoader(manager).parse(buffer) : format === 'ply' ? new PLYLoader(manager).parse(buffer) : new VTKLoader(manager).parse(buffer, '');
      if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
      return { root: plainMesh(geometry), animations: [], warnings };
    }
    case 'duf':
    case 'dsf': {
      const main = parseDson(new Uint8Array(buffer));
      const resolver = new DsonResolver([new VirtualFilesSource(vfs), ...contentSources()], { [path]: main });
      const built = await buildDaz(path, main, resolver);
      let hasMesh = false;
      built.root.traverse((o) => (hasMesh ||= o instanceof Mesh));
      // Without the figure itself there is nothing to import: ask for the content library.
      if (!hasMesh && built.missing.length) throw new MissingContentError(built.missing, 'daz');
      if (!hasMesh) throw new Error(built.warnings[0] ?? 'This Daz file has no figure or prop to import.');
      if (built.missing.length) warnings.push(`${built.missing.length} library files weren't found (for example ${built.missing[0]!.split('/').pop()}); the import uses what was available.`);
      warnings.push(...built.warnings);
      return { root: built.root, animations: [], warnings };
    }
    case '3ds':
      return { root: new TDSLoader(manager).parse(buffer, ''), animations: [], warnings };
    case '3mf':
      return { root: new ThreeMFLoader(manager).parse(buffer), animations: [], warnings };
    case 'amf':
      return { root: new AMFLoader(manager).parse(buffer), animations: [], warnings };
    case 'usd':
    case 'usda':
    case 'usdc':
    case 'usdz':
      return { root: new USDLoader(manager).parse(buffer, ''), animations: [], warnings };
    case 'lwo': {
      const lwo = new LWOLoader(manager).parse(buffer, '', path.split('/').pop()!.replace(/\.lwo$/i, ''));
      const g = new Group();
      for (const m of lwo.meshes) g.add(m);
      return { root: g, animations: [], warnings };
    }
    case 'kmz':
      return { root: new KMZLoader(manager).parse(buffer).scene, animations: [], warnings };
    case 'md2': {
      // Quake-style models: keyframe animation, no skeleton; kept as a prop in its first frame.
      const geometry = new MD2Loader(manager).parse(buffer);
      geometry.morphAttributes = {};
      return { root: plainMesh(geometry), animations: [], warnings };
    }
    case 'vox': {
      const result = new VOXLoader(manager).parse(buffer) as unknown as { chunks: Parameters<typeof buildMesh>[0][] };
      const g = new Group();
      // MagicaVoxel units are voxels; one voxel = 1 cm until the wizard's units say otherwise.
      for (const chunk of result.chunks) g.add(buildMesh(chunk));
      return { root: g, animations: [], warnings };
    }
  }
}
