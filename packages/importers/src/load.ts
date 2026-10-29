import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { Group, LoadingManager, Mesh, MeshStandardMaterial, type AnimationClip, type Object3D } from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
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
    case 'ply': {
      const geometry = format === 'stl' ? new STLLoader(manager).parse(buffer) : new PLYLoader(manager).parse(buffer);
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.7, vertexColors: geometry.hasAttribute('color') });
      const g = new Group();
      g.add(new Mesh(geometry, material));
      return { root: g, animations: [], warnings };
    }
  }
}
