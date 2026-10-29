import { activeScene, getAsset, readAssetModel, type Project } from '@poser/core';
import { AdaptiveQualityController, QUALITY_SETTINGS, logError, webgpuSelfTest } from '@poser/platform';
import { Viewport, type ViewName } from '@poser/render';
import { useSnackbar } from '@poser/ui';
import { useEffect, useRef, useState } from 'react';
import { crashGuard, memoryManager } from '../platformServices';
import { editProject, projectStore, useProject } from '../state/project';
import { useSettings } from '../state/settings';
import { useEffectiveQuality, useUi } from '../state/ui';
import { ViewCube } from './ViewCube';

/** Shared handle so toolbar actions (capture, frame, views) reach the viewport. */
export const viewportRef: { current: Viewport | null } = { current: null };

export function setView(view: ViewName) {
  viewportRef.current?.setView(view);
}

/** Rough per-figure GPU cost of the placeholder figures, for the memory manager. */
const PLACEHOLDER_FIGURE_BYTES = 12 * 1024 * 1024;

export function ViewportView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quality = useEffectiveQuality();
  const generation = useUi((s) => s.viewportGeneration);
  const anatomy = useUi((s) => s.anatomy);
  const studyMode = useUi((s) => s.studyMode);
  const notanThreshold = useUi((s) => s.notanThreshold);
  const lens = useUi((s) => s.lens);
  const overlay = useUi((s) => s.overlay);
  const selectedPropId = useUi((s) => s.selectedPropId);
  const reference = useUi((s) => s.reference);
  const referenceMode = useUi((s) => s.referenceMode);
  const referenceOpacity = useUi((s) => s.referenceOpacity);
  const cameraMatch = useUi((s) => s.cameraMatch);
  const horizon = useUi((s) => s.horizon);
  const cameraHeight = useUi((s) => s.cameraHeight);
  const propGizmo = useUi((s) => s.propGizmo);
  const skinOpacity = useUi((s) => s.skinOpacity);
  const adaptive = useSettings((s) => s.adaptiveQuality);
  // ?renderer=webgl also forces compatibility mode, for quick checks on a device.
  const forceWebGL = useSettings((s) => s.forceCompatibility) || new URLSearchParams(location.search).get('renderer') === 'webgl';
  const snackbar = useSnackbar();
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  // Create (and on device loss, recreate) the renderer.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let disposed = false;
    let vp: Viewport | null = null;
    const done = crashGuard.begin('Starting the 3D viewport');
    const onDeviceLost = (info: { message: string }) => {
      if (disposed) return;
      logError(new Error(`GPU device lost: ${info.message}`), 'viewport');
      // PLAN.md section 3.5: recreate the device one quality level lower.
      // The scene is still in memory, so nothing needs reloading.
      const ui = useUi.getState();
      ui.set({ qualityDrop: ui.qualityDrop + 1, viewportGeneration: ui.viewportGeneration + 1 });
      snackbar('The graphics device was reset. Quality lowered one level.');
    };
    const create = (webgl: boolean) => Viewport.create({ canvas, quality: QUALITY_SETTINGS[qualityRef.current], forceWebGL: webgl, onDeviceLost });
    const start = async (): Promise<Viewport> => {
      if (forceWebGL) return create(true);
      // WebGPU that exists but fails on first use goes to compatibility mode.
      const test = await webgpuSelfTest();
      if (!test.ok) {
        logError(new Error(`WebGPU self-test failed: ${test.reason}`), 'viewport');
        useUi.getState().set({ webgpuFailure: test.reason });
        return create(true);
      }
      try {
        return await create(false);
      } catch (err) {
        logError(err, 'viewport (WebGPU)');
        useUi.getState().set({ webgpuFailure: err instanceof Error ? err.message : String(err) });
        return create(true);
      }
    };
    start()
      .then((created) => {
        done();
        if (disposed) {
          created.dispose();
          return;
        }
        vp = created;
        viewportRef.current = created;
        // Imported models come from the Library (IndexedDB record + GLB in OPFS).
        created.assetLoader = async (assetId) => {
          const [record, model] = await Promise.all([getAsset(assetId), readAssetModel(assetId)]);
          return record && model ? { model, rig: record.rig } : null;
        };
        created.poseTools.onSelect = (figureId, joint) => {
          const ui = useUi.getState();
          const scene = activeScene(projectStore.getState().project);
          if (figureId && scene.props.some((p) => p.id === figureId)) {
            ui.set({ selectedPropId: figureId, selectedFigureId: null, selectedJoint: null });
            return;
          }
          ui.set({ selectedFigureId: figureId, selectedJoint: joint, selectedPropId: null, ...(figureId ? { inspectorOpen: true } : {}) });
        };
        created.onPropTransform = (propId, position, rotation, coalesceKey) => {
          editProject(
            'Move prop',
            (p) => {
              const prop = activeScene(p as Project).props.find((x) => x.id === propId);
              if (!prop) return;
              prop.transform.position = position;
              prop.transform.rotation = rotation;
            },
            { coalesceKey },
          );
        };
        created.poseTools.onEdit = (edit) => {
          editProject(
            edit.label,
            (p) => {
              const f = activeScene(p as Project).figures.find((x) => x.id === edit.figureId);
              if (!f) return;
              f.pose = edit.pose;
              if (edit.pins) f.pins = edit.pins;
            },
            { coalesceKey: edit.coalesceKey },
          );
        };
        created.onFigureLoad(
          () => created.frameAll(),
          (_id, err) => {
            logError(err, 'load figure');
            snackbar('A model in this scene could not be loaded');
          },
        );
        useUi.getState().set({ backend: created.backend });
        setViewport(created);
        setError(null);
      })
      .catch((err: unknown) => {
        done();
        logError(err, 'viewport');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      disposed = true;
      vp?.dispose();
      if (viewportRef.current === vp) viewportRef.current = null;
    };
  }, [generation, snackbar, forceWebGL]);

  // Keep the viewport in sync with the scene model.
  useEffect(() => {
    if (!viewport) return;
    const sync = () => {
      const scene = activeScene(projectStore.getState().project);
      viewport.sync(scene);
      for (const f of scene.figures) memoryManager.track(`figure:${f.id}`, PLACEHOLDER_FIGURE_BYTES, f.visible ? 'visible' : 'hidden');
    };
    sync();
    viewport.frameAll();
    return projectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) sync();
    });
  }, [viewport]);

  useEffect(() => {
    if (!viewport) return;
    viewport.setQuality(QUALITY_SETTINGS[quality]);
    memoryManager.setBudget(QUALITY_SETTINGS[quality].gpuMemoryBudgetMB * 1024 * 1024);
  }, [viewport, quality]);

  useEffect(() => {
    viewport?.setAnatomyView(anatomy, skinOpacity);
  }, [viewport, anatomy, skinOpacity]);

  useEffect(() => {
    viewport?.selectProp(selectedPropId, propGizmo);
  }, [viewport, selectedPropId, propGizmo]);

  useEffect(() => {
    viewport?.setStudyMode(studyMode, notanThreshold);
  }, [viewport, studyMode, notanThreshold]);

  useEffect(() => {
    if (viewport && viewport.lens !== lens) viewport.setLens(lens);
  }, [viewport, lens]);

  useEffect(() => {
    void viewport?.setBackgroundImage(reference && referenceMode === 'behind' ? reference.url : null);
  }, [viewport, reference, referenceMode]);

  useEffect(() => {
    if (viewport && cameraMatch) viewport.matchCamera(horizon, cameraHeight);
  }, [viewport, cameraMatch, horizon, cameraHeight, lens]);

  useEffect(() => {
    viewport?.setMatchGrid(cameraMatch);
  }, [viewport, cameraMatch]);

  // Pose tools follow the selection, mode, and the figure's pins.
  const selectedFigureId = useUi((s) => s.selectedFigureId);
  const selectedJoint = useUi((s) => s.selectedJoint);
  const poseMode = useUi((s) => s.poseMode);
  const jointLimits = useUi((s) => s.jointLimits);
  const pins = useProject((s) => activeScene(s.project).figures.find((f) => f.id === selectedFigureId)?.pins);
  useEffect(() => {
    viewport?.poseTools.setState({ figureId: selectedFigureId, joint: selectedJoint, mode: poseMode, limits: jointLimits, pins: pins ?? {} });
  }, [viewport, selectedFigureId, selectedJoint, poseMode, jointLimits, pins]);

  // Adaptive quality (PLAN.md section 3.5, step 4).
  useEffect(() => {
    if (!viewport || !adaptive) return;
    const controller = new AdaptiveQualityController();
    return viewport.onFrame((ms) => {
      const dir = controller.sample(ms, performance.now());
      if (dir === 0) return;
      const ui = useUi.getState();
      const next = Math.max(0, ui.qualityDrop - dir);
      if (next !== ui.qualityDrop) ui.set({ qualityDrop: next });
    });
  }, [viewport, adaptive]);

  return (
    <div className="viewport">
      <canvas ref={canvasRef} className="viewport__canvas" aria-label="3D viewport" tabIndex={0} />
      {reference && referenceMode === 'over' && <img className="viewport__reference" src={reference.url} alt="" style={{ opacity: referenceOpacity }} />}
      {overlay !== 'none' && <CompositionOverlay kind={overlay} />}
      {cameraMatch && <HorizonGuide horizon={horizon} />}
      {viewport && <ViewCube viewport={viewport} />}
      {error && (
        <div className="viewport__error" role="alert">
          <strong>The 3D view could not start.</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/** Rule-of-thirds or golden-ratio guides over the view (PLAN.md section 18). Not included in captures. */
function CompositionOverlay({ kind }: { kind: 'thirds' | 'golden' }) {
  const a = kind === 'thirds' ? 100 / 3 : 38.2;
  const b = 100 - a;
  return (
    <svg className="viewport__overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {[a, b].map((v) => (
        <g key={v}>
          <line x1={v} y1={0} x2={v} y2={100} />
          <line x1={0} y1={v} x2={100} y2={v} />
        </g>
      ))}
    </svg>
  );
}

/** Draggable horizon line for camera match: line it up with the photo's horizon. */
function HorizonGuide({ horizon }: { horizon: number }) {
  const set = useUi((s) => s.set);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => set({ horizon: Math.min(0.98, Math.max(0.02, (ev.clientY - box.top) / box.height)) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      className="viewport__horizon"
      style={{ top: `${horizon * 100}%` }}
      role="slider"
      aria-label="Horizon"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(horizon * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') set({ horizon: Math.max(0.02, horizon - 0.005) });
        if (e.key === 'ArrowDown') set({ horizon: Math.min(0.98, horizon + 0.005) });
      }}
    >
      <span>Horizon</span>
    </div>
  );
}
