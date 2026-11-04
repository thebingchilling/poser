import type { DsonFile } from './dson';

/** A small fake Daz library: a column "figure" with two bones, a shirt, a UV set, and morphs. */
export function library(): Record<string, DsonFile> {
  const ring = (y: number, r: number) => [
    [r, y, r],
    [-r, y, r],
    [-r, y, -r],
    [r, y, -r],
  ];
  const levels = [0, 50, 100, 150];
  const vertices = levels.flatMap((y) => ring(y, 10)) as [number, number, number][];
  const polys: number[][] = [];
  for (let l = 0; l < 3; l++) for (let k = 0; k < 4; k++) polys.push([0, l === 2 ? 1 : 0, l * 4 + k, l * 4 + ((k + 1) % 4), (l + 1) * 4 + ((k + 1) % 4), (l + 1) * 4 + k]);
  const figure: DsonFile = {
    asset_info: { id: '/data/Test%20Lib/Figure/Fig.dsf', type: 'figure' },
    geometry_library: [
      {
        id: 'geom',
        vertices: { count: 16, values: vertices },
        polygon_material_groups: { values: ['Skin', 'Nails'] },
        polylist: { count: polys.length, values: polys },
        default_uv_set: '/data/Test%20Lib/Figure/UV.dsf#base',
      },
    ],
    node_library: [
      { id: 'Fig', type: 'figure', label: 'Test Figure', center_point: [] },
      { id: 'hip', type: 'bone', parent: '#Fig', center_point: [{ id: 'y', value: 100 }] },
      { id: 'abdomen', type: 'bone', parent: '#hip', center_point: [{ id: 'y', value: 120 }] },
    ],
    modifier_library: [
      {
        id: 'SkinBinding',
        skin: {
          node: '#Fig',
          geometry: '#geom',
          vertex_count: 16,
          joints: [
            { id: 'hip', node: '#hip', node_weights: { count: 12, values: vertices.map((v, i) => [i, v[1] <= 100 ? 1 : 0] as [number, number]).filter(([, w]) => w) } },
            { id: 'abdomen', node: '#abdomen', node_weights: { count: 4, values: vertices.map((v, i) => [i, v[1] > 100 ? 1 : 0] as [number, number]).filter(([, w]) => w) } },
          ],
        },
      },
    ],
    material_library: [{ id: 'Skin', groups: ['Skin'], diffuse: { channel: { id: 'diffuse', value: [0.8, 0.6, 0.5] } } }],
  };
  const uv: DsonFile = {
    uv_set_library: [{ id: 'base', vertex_count: 16, uvs: { count: 17, values: [...vertices.map((v, i) => [i / 16, v[1] / 150] as [number, number]), [0.99, 0.99]] }, polygon_vertex_indices: [[0, 0, 16]] }],
  };
  const tall: DsonFile = {
    modifier_library: [
      {
        id: 'Tall',
        channel: { id: 'value', value: 0 },
        morph: { vertex_count: 16, deltas: { count: 4, values: [12, 13, 14, 15].map((i) => [i, 0, 10, 0] as [number, number, number, number]) } },
        // Moving the top ring also moves the abdomen joint (rigging follows the morph).
        formulas: [{ output: 'abdomen:/data/Test%20Lib/Figure/Fig.dsf#abdomen?center_point/y', operations: [{ op: 'push', url: 'Fig:/data/Test%20Lib/Figure/Morphs/Tall.dsf#Tall?value' }, { op: 'push', val: 10 }, { op: 'mult' }] }],
      },
    ],
  };
  const character: DsonFile = {
    modifier_library: [
      {
        id: 'Character',
        channel: { id: 'value', value: 0 },
        formulas: [{ output: 'Fig:/data/Test%20Lib/Figure/Morphs/Tall.dsf#Tall?value', operations: [{ op: 'push', url: 'Fig:/data/Test%20Lib/Figure/Morphs/Character.dsf#Character?value' }, { op: 'push', val: 0.5 }, { op: 'mult' }] }],
      },
    ],
  };
  const shirtVerts = [...ring(105, 11), ...ring(130, 11)] as [number, number, number][];
  const shirt: DsonFile = {
    geometry_library: [
      {
        id: 'shirtGeom',
        vertices: { count: 8, values: shirtVerts },
        polygon_material_groups: { values: ['Cloth'] },
        polylist: { count: 4, values: [0, 1, 2, 3].map((k) => [0, 0, k, (k + 1) % 4, 4 + ((k + 1) % 4), 4 + k]) },
        // Pretend this is a geograft that replaces the body's first polygon.
        graft: { hidden_polys: { values: [0] } },
      },
    ],
    node_library: [
      { id: 'Shirt', type: 'figure', label: 'Shirt', center_point: [] },
      { id: 'hip', type: 'bone', parent: '#Shirt', center_point: [{ id: 'y', value: 100 }] },
      { id: 'abdomen', type: 'bone', parent: '#hip', center_point: [{ id: 'y', value: 120 }] },
      { id: 'shirtTail', type: 'bone', parent: '#hip', center_point: [{ id: 'y', value: 105 }, { id: 'z', value: -11 }] },
    ],
    modifier_library: [
      {
        id: 'SkinBinding',
        skin: {
          node: '#Shirt',
          geometry: '#shirtGeom',
          vertex_count: 8,
          joints: [
            { id: 'abdomen', node: '#abdomen', node_weights: { count: 4, values: [4, 5, 6, 7].map((i) => [i, 1] as [number, number]) } },
            { id: 'shirtTail', node: '#shirtTail', node_weights: { count: 4, values: [0, 1, 2, 3].map((i) => [i, 1] as [number, number]) } },
          ],
        },
      },
    ],
  };
  const scene: DsonFile = {
    scene: {
      nodes: [
        { id: 'Fig', url: '/data/Test%20Lib/Figure/Fig.dsf#Fig', geometries: [{ id: 'Fig-1', url: '/data/Test%20Lib/Figure/Fig.dsf#geom' }] },
        { id: 'Shirt', url: '/data/Test%20Lib/Shirt/Shirt.dsf#Shirt', conform_target: '#Fig', geometries: [{ id: 'Shirt-1', url: '/data/Test%20Lib/Shirt/Shirt.dsf#shirtGeom' }] },
      ],
      modifiers: [
        { id: 'Character', parent: '#Fig', url: '/data/Test%20Lib/Figure/Morphs/Character.dsf#Character', channel: { id: 'value', current_value: 1 } },
        { id: 'Tall', parent: '#Fig', url: '/data/Test%20Lib/Figure/Morphs/Tall.dsf#Tall', channel: { id: 'value', current_value: 0 } },
      ],
      materials: [{ id: 'Skin', geometry: '#Fig-1', groups: ['Skin'], url: '/data/Test%20Lib/Figure/Fig.dsf#Skin', diffuse: { channel: { id: 'diffuse', current_value: [1, 0, 0] } } }],
    },
  };
  return {
    'data/Test Lib/Figure/Fig.dsf': figure,
    'data/Test Lib/Figure/UV.dsf': uv,
    'data/Test Lib/Figure/Morphs/Tall.dsf': tall,
    'data/Test Lib/Figure/Morphs/Character.dsf': character,
    'data/Test Lib/Shirt/Shirt.dsf': shirt,
    'People/Test.duf': scene,
  };
}

