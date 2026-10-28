import { activeScene, type Figure, type Project } from '@poser/core';
import { Slider, Tabs } from '@poser/ui';
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
          { value: 'pose', label: 'Pose', icon: 'accessibility_new', content: <Later phase={1} what="Joint rotations and IK" /> },
          { value: 'body', label: 'Body', icon: 'body_system', content: <Later phase={1} what="Morph sliders and measurements" /> },
          { value: 'physics', label: 'Physics', icon: 'science', content: <Later phase={2} what="Physics settings" /> },
          { value: 'cloth', label: 'Cloth', icon: 'layers', content: <Later phase={2} what="Clothing and fabrics" /> },
          { value: 'material', label: 'Material', icon: 'palette', content: <Later phase={1} what="The material editor" /> },
        ]}
      />
    </>
  );
}
