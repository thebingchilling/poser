import type JoltType from 'jolt-physics';
import initJolt from 'jolt-physics';

let joltPromise: Promise<typeof JoltType> | null = null;

/** Loads the Jolt WASM module once. PLAN.md section 20: Jolt runs in a worker in the real build. */
export function loadJolt(): Promise<typeof JoltType> {
  joltPromise ??= initJolt();
  return joltPromise;
}
