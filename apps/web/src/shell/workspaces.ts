import type { IconName, NavItem } from '@poser/ui';
import type { WorkspaceId } from '../state/ui';

export const WORKSPACES: readonly (NavItem<WorkspaceId> & { title: string; phase?: number; fab?: { icon: IconName; label: string } })[] = [
  { id: 'library', icon: 'library_books', label: 'Library', title: 'Library' },
  { id: 'scene', icon: 'deployed_code', label: 'Scene', title: 'Scene' },
  { id: 'pose', icon: 'accessibility_new', label: 'Pose', title: 'Pose' },
  { id: 'body', icon: 'body_system', label: 'Body', title: 'Body' },
  { id: 'physics', icon: 'science', label: 'Physics', title: 'Physics', phase: 2 },
  { id: 'objects', icon: 'category', label: 'Objects', title: 'Objects' },
  { id: 'render', icon: 'lightbulb', label: 'Render', title: 'Render' },
  { id: 'animate', icon: 'movie', label: 'Animate', title: 'Animate', phase: 9 },
];

/** The phone navigation bar shows these; the rest go in a labelled "More" menu. */
export const PHONE_PRIMARY: readonly WorkspaceId[] = ['library', 'scene', 'pose', 'body', 'render'];
