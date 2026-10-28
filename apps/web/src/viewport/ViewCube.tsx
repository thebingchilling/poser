import type { Viewport, ViewName } from '@poser/render';
import { useEffect, useRef } from 'react';

const FACES: { view: ViewName; label: string; transform: string }[] = [
  { view: 'front', label: 'Front', transform: 'translateZ(var(--half))' },
  { view: 'back', label: 'Back', transform: 'rotateY(180deg) translateZ(var(--half))' },
  { view: 'left', label: 'Left', transform: 'rotateY(90deg) translateZ(var(--half))' },
  { view: 'right', label: 'Right', transform: 'rotateY(-90deg) translateZ(var(--half))' },
  { view: 'top', label: 'Top', transform: 'rotateX(90deg) translateZ(var(--half))' },
  { view: 'bottom', label: 'Bottom', transform: 'rotateX(-90deg) translateZ(var(--half))' },
];

/**
 * View cube (PLAN.md section 3.4): a CSS 3D cube that turns with the
 * camera. Each face is a labelled button that snaps the camera to that view.
 */
export function ViewCube({ viewport }: { viewport: Viewport }) {
  const cubeRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      viewport.onCameraChange((q) => {
        // Inverse camera rotation; CSS Y points down, so flip x and z.
        const el = cubeRef.current;
        if (!el) return;
        const [x, y, z, w] = [q.x, q.y, q.z, q.w];
        // Rows of the inverse (transposed) camera rotation.
        const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y + z * w), r02 = 2 * (x * z - y * w);
        const r10 = 2 * (x * y - z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z + x * w);
        const r20 = 2 * (x * z + y * w), r21 = 2 * (y * z - x * w), r22 = 1 - 2 * (x * x + y * y);
        // Convert to CSS's y-down space; matrix3d is column-major.
        const css = [r00, -r10, r20, 0, -r01, r11, -r21, 0, r02, -r12, r22, 0, 0, 0, 0, 1];
        el.style.transform = `matrix3d(${css.join(',')})`;
      }),
    [viewport],
  );

  return (
    <div className="view-cube" role="group" aria-label="View cube">
      <div className="view-cube__cube" ref={cubeRef}>
        {FACES.map((f) => (
          <button key={f.view} type="button" className="view-cube__face" style={{ transform: f.transform }} onClick={() => viewport.setView(f.view)} aria-label={`${f.label} view`}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
