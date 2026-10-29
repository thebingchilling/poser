import type { CanonicalPose, Vec3 } from '@poser/core';
import { LIMBS, applyLimits, solveTwoBone, type Effector } from '@poser/posing';
import type { Q, V3 } from '@poser/rig';
import {
  Camera,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PosableFigure } from '../figure/types';

/** Joints that get a handle (PLAN.md section 6). Fingers get smaller ones. */
const MAIN_JOINTS = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'];
for (const s of ['left', 'right']) MAIN_JOINTS.push(...['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map((b) => s + b));
const FINGER_JOINTS: string[] = [];
for (const s of ['left', 'right']) {
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
    for (const seg of f === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']) FINGER_JOINTS.push(s + f + seg);
  }
}
export const EFFECTORS = Object.keys(LIMBS) as Effector[];

export type PoseMode = 'fk' | 'ik';

export interface PoseEdit {
  figureId: string;
  pose: CanonicalPose;
  pins?: Record<string, Vec3>;
  label: string;
  /** Edits during one drag share a key so they undo as one step. */
  coalesceKey: string;
}

export interface PoseToolsState {
  figureId: string | null;
  joint: string | null;
  mode: PoseMode;
  limits: boolean;
  pins: Record<string, Vec3>;
}

const toVec = (v: V3) => new Vector3(v[0], v[1], v[2]);

/**
 * Joint handles, the rotation gizmo, IK dragging, and pins on the selected
 * figure (PLAN.md section 3.4 and 6). Emits pose edits; the app applies them
 * to the scene model (so they undo), and the viewport re-syncs.
 */
export class PoseTools {
  readonly group = new Group();
  private readonly controls: TransformControls;
  private readonly proxy = new Object3D();
  private readonly handles = new Map<string, Mesh>();
  private readonly raycaster = new Raycaster();
  private state: PoseToolsState = { figureId: null, joint: null, mode: 'fk', limits: true, pins: {} };
  private figure: PosableFigure | null = null;
  private pose: CanonicalPose = {};
  private dragId = 0;
  private dragging = false;
  private readonly materials = {
    joint: new MeshBasicMaterial({ color: 0x9be7ff, depthTest: false, transparent: true, opacity: 0.9 }),
    finger: new MeshBasicMaterial({ color: 0xc8f0ff, depthTest: false, transparent: true, opacity: 0.8 }),
    effector: new MeshBasicMaterial({ color: 0xffd36e, depthTest: false, transparent: true, opacity: 0.95 }),
    pinned: new MeshBasicMaterial({ color: 0xff6b6b, depthTest: false, transparent: true, opacity: 0.95 }),
    selected: new MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
  };

  onEdit: ((edit: PoseEdit) => void) | null = null;

  /** Follows the viewport when it switches between perspective and orthographic cameras. */
  setCamera(camera: Camera): void {
    this.camera = camera;
    this.controls.camera = camera;
  }

  onSelect: ((figureId: string | null, joint: string | null) => void) | null = null;

  constructor(
    private camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly orbit: OrbitControls,
    private readonly invalidate: () => void,
    private readonly figures: () => Map<string, { object: PosableFigure }>,
    private readonly figurePose: (figureId: string) => CanonicalPose | undefined,
  ) {
    this.group.add(this.proxy);
    this.controls = new TransformControls(camera, canvas);
    this.controls.setSize(0.8);
    this.controls.setSpace('local');
    this.controls.attach(this.proxy);
    this.controls.enabled = false;
    this.controls.getHelper().visible = false;
    this.controls.addEventListener('dragging-changed', (e) => {
      this.dragging = !!(e as unknown as { value: boolean }).value;
      this.orbit.enabled = !this.dragging;
      if (this.dragging) this.dragId++;
    });
    this.controls.addEventListener('objectChange', () => this.onGizmoChange());
    this.controls.addEventListener('change', () => this.invalidate());
    this.attachPointer();
  }

  get helper(): Object3D {
    return this.controls.getHelper();
  }

  setState(state: PoseToolsState): void {
    this.state = state;
    this.refresh();
  }

  /** Re-reads the selected figure and pose and repositions handles and gizmo. */
  refresh(): void {
    const id = this.state.figureId;
    const entry = id ? this.figures().get(id) : undefined;
    this.figure = entry?.object.poseSkeleton ? entry.object : null;
    this.pose = (id && this.figurePose(id)) || {};
    this.updateHandles();
    if (!this.dragging) this.placeGizmo();
    this.invalidate();
  }

  private worldMatrix(): Matrix4 {
    return this.figure ? this.figure.root.matrixWorld : new Matrix4();
  }

  private updateHandles(): void {
    for (const h of this.handles.values()) h.visible = false;
    const fig = this.figure;
    if (!fig?.poseSkeleton) return;
    fig.root.updateMatrixWorld(true);
    const positions = fig.poseSkeleton.positions(this.pose);
    const m = this.worldMatrix();
    const scale = fig.height / 1.68;
    for (const joint of [...MAIN_JOINTS, ...FINGER_JOINTS]) {
      const p = positions.get(joint);
      if (!p) continue;
      let h = this.handles.get(joint);
      if (!h) {
        h = new Mesh(new SphereGeometry(1, 10, 8), this.materials.joint);
        h.renderOrder = 1000;
        h.userData.joint = joint;
        this.handles.set(joint, h);
        this.group.add(h);
      }
      const isEffector = (EFFECTORS as string[]).includes(joint);
      const isFinger = FINGER_JOINTS.includes(joint);
      h.material =
        joint === this.state.joint ? this.materials.selected : this.state.pins[joint] ? this.materials.pinned : isEffector ? this.materials.effector : isFinger ? this.materials.finger : this.materials.joint;
      h.scale.setScalar((isEffector ? 0.02 : isFinger ? 0.006 : 0.013) * scale);
      h.position.copy(toVec(p).applyMatrix4(m));
      h.visible = true;
    }
  }

  private placeGizmo(): void {
    const fig = this.figure;
    const joint = this.state.joint;
    const helper = this.controls.getHelper();
    if (!fig?.poseSkeleton || !joint || !fig.poseSkeleton.rest[joint]) {
      this.controls.enabled = false;
      helper.visible = false;
      return;
    }
    const ik = this.state.mode === 'ik' && (EFFECTORS as string[]).includes(joint);
    this.controls.setMode(ik ? 'translate' : 'rotate');
    this.controls.setSpace(ik ? 'world' : 'local');
    const pos = fig.poseSkeleton.positions(this.pose).get(joint)!;
    const rot = fig.poseSkeleton.worldRotations(this.pose).get(joint)!;
    const rootQ = new Quaternion();
    fig.root.getWorldQuaternion(rootQ);
    this.proxy.position.copy(toVec(pos).applyMatrix4(this.worldMatrix()));
    this.proxy.quaternion.copy(rootQ).multiply(new Quaternion(rot[0], rot[1], rot[2], rot[3]));
    this.proxy.updateMatrixWorld(true);
    this.controls.enabled = true;
    helper.visible = true;
  }

  private onGizmoChange(): void {
    const fig = this.figure;
    const id = this.state.figureId;
    const joint = this.state.joint;
    if (!fig?.poseSkeleton || !id || !joint || !this.dragging) return;
    const skel = fig.poseSkeleton;
    const inv = new Matrix4().copy(this.worldMatrix()).invert();
    let pose: CanonicalPose;
    let label: string;
    const pins = { ...this.state.pins };
    if (this.controls.mode === 'translate') {
      const target = this.proxy.position.clone().applyMatrix4(inv);
      pose = solveTwoBone(skel, this.pose, joint as Effector, [target.x, target.y, target.z]).pose;
      if (pins[joint]) pins[joint] = [target.x, target.y, target.z];
      label = 'Move ' + jointLabel(joint);
    } else {
      const rootQ = new Quaternion();
      fig.root.getWorldQuaternion(rootQ);
      const w = rootQ.invert().multiply(this.proxy.quaternion);
      const world: Q = [w.x, w.y, w.z, w.w];
      pose = { ...this.pose, [joint]: skel.localFor(this.pose, joint, world) };
      label = 'Rotate ' + jointLabel(joint);
    }
    if (this.state.limits) pose = applyLimits(skel, pose).pose;
    // Pinned hands and feet stay where they were held.
    for (const [eff, target] of Object.entries(pins)) {
      if (eff === joint && this.controls.mode === 'translate') continue;
      pose = solveTwoBone(skel, pose, eff as Effector, target as V3).pose;
    }
    this.pose = pose;
    this.updateHandles();
    this.onEdit?.({ figureId: id, pose, pins, label, coalesceKey: `pose-drag-${this.dragId}` });
  }

  private attachPointer(): void {
    let down: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || this.dragging) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return; // that was an orbit drag
      this.pick(e);
    });
  }

  /** Click: a handle selects its joint; a figure selects its nearest joint; empty space clears. */
  private pick(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const visibleHandles = [...this.handles.values()].filter((h) => h.visible);
    const hit = this.raycaster.intersectObjects(visibleHandles, false)[0];
    if (hit) {
      this.onSelect?.(this.state.figureId, hit.object.userData.joint as string);
      return;
    }
    const roots = [...this.figures().entries()].map(([id, f]) => {
      f.object.root.userData.figureId = id;
      return f.object.root;
    });
    const bodyHit = this.raycaster.intersectObjects(roots, true)[0];
    if (!bodyHit) {
      this.onSelect?.(null, null);
      return;
    }
    let o: Object3D | null = bodyHit.object;
    while (o && !o.userData.figureId) o = o.parent;
    const figureId = (o?.userData.figureId as string | undefined) ?? null;
    const fig = figureId ? this.figures().get(figureId)?.object : undefined;
    if (!figureId || !fig?.poseSkeleton) {
      this.onSelect?.(figureId, null);
      return;
    }
    // Nearest main joint to the clicked point.
    const local = bodyHit.point.clone().applyMatrix4(new Matrix4().copy(fig.root.matrixWorld).invert());
    const positions = fig.poseSkeleton.positions(this.figurePose(figureId) ?? {});
    let best: string | null = null;
    let bestD = Infinity;
    for (const j of MAIN_JOINTS) {
      const p = positions.get(j);
      if (!p) continue;
      const d = local.distanceTo(toVec(p));
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    this.onSelect?.(figureId, best);
  }

  dispose(): void {
    this.controls.dispose();
    for (const h of this.handles.values()) h.geometry.dispose();
  }
}

/** "leftUpperArm" → "left upper arm". */
export function jointLabel(joint: string): string {
  return joint.replace(/([A-Z])/g, ' $1').toLowerCase();
}
