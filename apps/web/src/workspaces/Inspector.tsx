import { activeScene, type Figure, type Project } from '@poser/core';
import { Slider, Tabs, TextField } from '@poser/ui';
import { jointLabel } from '@poser/render';
import { Euler, Quaternion } from 'three';
import { useLibrary } from '../state/library';
import { setJointRotation } from './posing';
import { useState } from 'react';
import { editProject, useActiveScene } from '../state/project';
import { useUi } from '../state/ui';

function yawDegrees(q: Figure['transform']['rotation']): number {
  const [, y, , w] = q;
  return Math.round(((2 * Math.atan2(y, w) * 180) / Math.PI + 540) % 360) - 180;
}

function TransformTab({ figure }: { figure: Figure }) {
  const edit = (label: string, key: string, recipe: (f: Figure) => void) =>
    editProject(
      label,
      (p) => {
        const f = activeScene(p as Project).figures.find((x) => x.id === figure.id);
        if (f) recipe(f);
      },
      { coalesceKey: `${key}:${figure.id}` },
    );
  const [x, , z] = figure.transform.position;
  return (
    <>
      <Slider label="Left / right" unit="m" value={x} min={-5} max={5} step={0.01} onChange={(v) => edit('Move figure', 'pos-x', (f) => void (f.transform.position[0] = v))} />
      <Slider label="Forward / back" unit="m" value={z} min={-5} max={5} step={0.01} onChange={(v) => edit('Move figure', 'pos-z', (f) => void (f.transform.position[2] = v))} />
      <Slider
        label="Turn"
        unit="°"
        value={yawDegrees(figure.transform.rotation)}
        min={-180}
        max={180}
        step={1}
        onChange={(deg) =>
          edit('Turn figure', 'yaw', (f) => {
            const a = (deg * Math.PI) / 360;
            f.transform.rotation = [0, Math.sin(a), 0, Math.cos(a)];
          })
        }
      />
    </>
  );
}

const DEG = 180 / Math.PI;

/** Fine-tuning of the selected joint as three angles (PLAN.md section 6). */
function PoseTab({ figure }: { figure: Figure }) {
  const joint = useUi((s) => s.selectedJoint);
  if (!joint) return <p className="hint">Select a joint (click a handle on the figure) to fine-tune it.</p>;
  const q = figure.pose[joint] ?? [0, 0, 0, 1];
  const e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), 'XYZ');
  const set = (axis: 'x' | 'y' | 'z', deg: number) => {
    const next = e.clone();
    next[axis] = deg / DEG;
    const nq = new Quaternion().setFromEuler(next);
    setJointRotation(joint, [nq.x, nq.y, nq.z, nq.w], `joint-${figure.id}-${joint}-${axis}`);
  };
  return (
    <>
      <p className="inspector__name">{jointLabel(joint)}</p>
      <Slider label="Front / back (X)" unit="°" value={Math.round(e.x * DEG)} min={-180} max={180} step={1} onChange={(v) => set('x', v)} />
      <Slider label="Turn (Y)" unit="°" value={Math.round(e.y * DEG)} min={-180} max={180} step={1} onChange={(v) => set('y', v)} />
      <Slider label="Side (Z)" unit="°" value={Math.round(e.z * DEG)} min={-180} max={180} step={1} onChange={(v) => set('z', v)} />
    </>
  );
}

/** Morph sliders for imported figures (PLAN.md section 6). */
function BodyTab({ figure }: { figure: Figure }) {
  const asset = useLibrary((s) => s.assets.find((a) => a.id === figure.assetId));
  const [query, setQuery] = useState('');
  if (!asset) return <Later phase={4} what="Body shape controls for the built-in figures" />;
  if (!asset.morphs.length) return <p className="hint">This figure has no morphs (shape keys).</p>;
  const shown = asset.morphs.filter((m) => m.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 60);
  const edit = (name: string, value: number) =>
    editProject(
      'Change morph',
      (p) => {
        const f = activeScene(p as Project).figures.find((x) => x.id === figure.id);
        if (f) f.morphValues[name] = value;
      },
      { coalesceKey: `morph-${figure.id}-${name}` },
    );
  return (
    <>
      {asset.morphs.length > 8 && <TextField label={`Search ${asset.morphs.length} morphs`} value={query} onChange={(e) => setQuery(e.target.value)} />}
      {shown.map((m) => (
        <Slider key={m} label={m} value={figure.morphValues[m] ?? 0} min={0} max={1} step={0.01} displayScale={100} unit="%" onChange={(v) => edit(m, v)} />
      ))}
    </>
  );
}

function Later({ phase, what }: { phase: number; what: string }) {
  return (
    <p className="hint">
      {what} arrive{what.endsWith('s') ? '' : 's'} in Phase {phase}.
    </p>
  );
}

type InspectorTab = 'transform' | 'pose' | 'body' | 'physics' | 'cloth' | 'material';

export function Inspector() {
  const scene = useActiveScene();
  const selectedId = useUi((s) => s.selectedFigureId);
  const [tab, setTab] = useState<InspectorTab>('transform');
  const figure = scene.figures.find((f) => f.id === selectedId);
  if (!figure) return <p className="empty">Select a figure in the Scene panel to see its properties.</p>;
  return (
    <>
      <p className="inspector__name">{figure.name}</p>
      <Tabs
        label="Properties"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'transform', label: 'Transform', icon: 'open_with', content: <TransformTab figure={figure} /> },
          { value: 'pose', label: 'Pose', icon: 'accessibility_new', content: <PoseTab figure={figure} /> },
          { value: 'body', label: 'Body', icon: 'body_system', content: <BodyTab figure={figure} /> },
          { value: 'physics', label: 'Physics', icon: 'science', content: <Later phase={2} what="Physics settings" /> },
          { value: 'cloth', label: 'Cloth', icon: 'layers', content: <Later phase={2} what="Clothing and fabrics" /> },
          { value: 'material', label: 'Material', icon: 'palette', content: <Later phase={1} what="The material editor" /> },
        ]}
      />
    </>
  );
}
