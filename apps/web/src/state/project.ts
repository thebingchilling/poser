import { activeScene, createProjectStore, type Project, type ProjectState } from '@poser/core';
import { useStore } from 'zustand';

export const projectStore = createProjectStore();

export function useProject<T>(selector: (s: ProjectState) => T): T {
  return useStore(projectStore, selector);
}

export function useActiveScene() {
  return useProject((s) => activeScene(s.project));
}

export function editProject(...args: Parameters<ProjectState['edit']>) {
  projectStore.getState().edit(...args);
}

export function currentProject(): Project {
  return projectStore.getState().project;
}
