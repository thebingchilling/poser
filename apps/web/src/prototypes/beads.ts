import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry, type Scene } from 'three/webgpu';

/** Draws particles as spheres with one instanced mesh per group. */
export class Beads {
  readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();

  constructor(scene: Scene, count: number, radius: number, colour: number) {
    this.mesh = new InstancedMesh(new SphereGeometry(radius, 12, 8), new MeshStandardMaterial({ color: new Color(colour), roughness: 0.6 }), count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** positions: vec4 per particle; draws [first, first + count). */
  update(positions: Float32Array, first: number): void {
    for (let k = 0; k < this.mesh.count; k++) {
      const i = (first + k) * 4;
      this.m.makeTranslation(positions[i]!, positions[i + 1]!, positions[i + 2]!);
      this.mesh.setMatrixAt(k, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
