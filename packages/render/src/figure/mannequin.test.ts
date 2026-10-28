import { CANONICAL_BONE_NAMES } from '@poser/rig';
import { Box3, Mesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { FigureObject } from './mannequin';

describe('placeholder figures', () => {
  it.each(['builtin:female', 'builtin:male'] as const)('%s has every canonical bone and fits its height', (id) => {
    const fig = new FigureObject(id);
    for (const name of CANONICAL_BONE_NAMES) expect(fig.bones.has(name), name).toBe(true);
    const skin = new Box3();
    fig.root.traverse((o) => {
      if (o instanceof Mesh && o.userData.layer === 'skin') skin.expandByObject(o);
    });
    const size = skin.getSize(skin.min.clone());
    expect(size.y).toBeGreaterThan(fig.height * 0.95);
    expect(size.y).toBeLessThan(fig.height * 1.04);
    expect(skin.min.y).toBeGreaterThan(-0.03);
    // T-pose arm span is about the body height.
    expect(size.x).toBeGreaterThan(fig.height * 0.85);
    expect(size.x).toBeLessThan(fig.height * 1.1);
    fig.dispose();
  });

  it('hides inner layers by default and toggles them', () => {
    const fig = new FigureObject('builtin:female');
    const layerVisible = (layer: string) => {
      let any = false;
      fig.root.traverse((o) => {
        if (o.userData.layer === layer && o.visible) any = true;
      });
      return any;
    };
    expect(layerVisible('skin')).toBe(true);
    expect(layerVisible('skeleton')).toBe(false);
    fig.setLayerVisible('skeleton', true);
    expect(layerVisible('skeleton')).toBe(true);
    fig.dispose();
  });
});
