/**
 * Neutral tab option (PLAN.md section 16.6): a plain title and icon so the
 * browser tab doesn't advertise the app.
 */

export const NEUTRAL_TITLE = 'Notes';
const NEUTRAL_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="5" y="3" width="22" height="26" rx="3" fill="#9e9e9e"/><path d="M10 11h12M10 16h12M10 21h8" stroke="#fff" stroke-width="2"/></svg>',
  );

let original: { title: string; icon: string | null } | null = null;

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  return link;
}

export function setNeutralTab(enabled: boolean, title = 'Poser'): void {
  const link = iconLink();
  if (enabled) {
    original ??= { title, icon: link.getAttribute('href') };
    document.title = NEUTRAL_TITLE;
    link.href = NEUTRAL_ICON;
  } else {
    document.title = original?.title ?? title;
    if (original?.icon) link.href = original.icon;
    original = null;
  }
}
