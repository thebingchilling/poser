import { useSyncExternalStore } from 'react';

/** MD3 window size classes (PLAN.md section 3.1). */
export type WindowSizeClass = 'compact' | 'medium' | 'expanded' | 'large';

export function sizeClassFor(width: number): WindowSizeClass {
  if (width < 600) return 'compact';
  if (width < 840) return 'medium';
  if (width < 1200) return 'expanded';
  return 'large';
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

export function useWindowSizeClass(): WindowSizeClass {
  return useSyncExternalStore(subscribe, () => sizeClassFor(window.innerWidth), () => 'expanded');
}
