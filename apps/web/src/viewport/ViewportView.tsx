import { activeScene } from '@poser/core';
import { AdaptiveQualityController, QUALITY_SETTINGS, logError, webgpuSelfTest } from '@poser/platform';
import { Viewport, type ViewName } from '@poser/render';
import { useSnackbar } from '@poser/ui';
import { useEffect, useRef, useState } from 'react';
import { crashGuard, memoryManager } from '../platformServices';
import { projectStore } from '../state/project';
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
