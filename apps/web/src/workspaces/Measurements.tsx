import type { BodyMeasurements } from '@poser/render';
import { Button, ListSubheader } from '@poser/ui';
import { useEffect, useState } from 'react';
import { useActiveScene } from '../state/project';
import { useUi } from '../state/ui';
import { viewportRef } from '../viewport/ViewportView';

const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;

/**
 * Live body measurements of the selected figure (PLAN.md section 17.3),
 * taken in its rest pose and updated when its body shape changes.
 */
export function MeasurementsPanel() {
  const scene = useActiveScene();
  const selectedId = useUi((s) => s.selectedFigureId);
  const figure = scene.figures.find((f) => f.id === selectedId) ?? scene.figures[0];
  const [m, setM] = useState<BodyMeasurements | null>(null);
  const [tick, setTick] = useState(0);
  const morphKey = figure ? JSON.stringify(figure.morphValues) : '';

  // Re-measure after the shape settles (morph sliders fire many edits) and once a model finishes loading.
  useEffect(() => {
    if (!figure) return setM(null);
    const t = setTimeout(() => setM(viewportRef.current?.measureFigure(figure.id) ?? null), 250);
    return () => clearTimeout(t);
  }, [figure?.id, figure?.assetId, morphKey, tick]);
  useEffect(() => viewportRef.current?.onFigureLoad(() => setTick((n) => n + 1)), []);

  if (!figure) return null;
  const rows: [string, string][] = m
    ? [
        ['Height', cm(m.height)],
        ['Bust', cm(m.bust)],
        ['Underbust', cm(m.underbust)],
        ['Waist', cm(m.waist)],
        ['Hips', cm(m.hips)],
        ...(m.braSize ? ([['Bra size (EU)', m.braSize]] as [string, string][]) : []),
        ['Estimated weight', `${Math.round(m.weight)} kg`],
        ['Shoulder width', cm(m.shoulderWidth)],
        ['Arm length', cm(m.armLength)],
        ['Leg length', cm(m.legLength)],
      ]
    : [];
  return (
    <>
      <ListSubheader>Measurements · {figure.name}</ListSubheader>
      {!m && <p className="hint">Measurements appear once the figure has loaded.</p>}
      {m && (
        <dl className="measure-list">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="hint">Taken in the rest pose, around the body like a tape measure. Weight is estimated from body volume; clothes and hair on imported figures add to it.</p>
      <Button variant="text" icon="straighten" onClick={() => setTick((n) => n + 1)}>Measure again</Button>
    </>
  );
}
