import {
  Hct,
  MaterialDynamicColors,
  SchemeTonalSpot,
  argbFromHex,
  hexFromArgb,
  type DynamicColor,
} from '@material/material-color-utilities';

/**
 * MD3 color roles generated from a seed color with material-color-utilities
 * (PLAN.md section 3.1), written as --md-sys-color-* CSS variables.
 */

export const DEFAULT_SEED = '#8e4e6b';

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant', 'shadow', 'scrim', 'surfaceTint',
] as const;

export type ColorRole = (typeof ROLES)[number];

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** Returns role → hex for one scheme. contrast: 0 standard, 0.5 medium, 1 high. */
export function generateScheme(seedHex: string, dark: boolean, contrast = 0): Record<ColorRole, string> {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, contrast);
  const colors = new MaterialDynamicColors();
  const out = {} as Record<ColorRole, string>;
  for (const role of ROLES) {
    const color = (colors[role] as () => DynamicColor).call(colors);
    out[role] = hexFromArgb(color.getArgb(scheme));
  }
  return out;
}

export function schemeToCss(scheme: Record<ColorRole, string>): string {
  return Object.entries(scheme)
    .map(([role, hex]) => `--md-sys-color-${kebab(role)}: ${hex};`)
    .join('\n');
}

export interface ThemeOptions {
  seed: string;
  mode: 'dark' | 'light';
  contrast?: number;
}

const STYLE_ID = 'md-color-scheme';

/** Apply a theme to the document by (re)writing a style element. */
export function applyTheme({ seed, mode, contrast = 0 }: ThemeOptions): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.append(el);
  }
  const scheme = generateScheme(seed, mode === 'dark', contrast);
  el.textContent = `:root {\n${schemeToCss(scheme)}\ncolor-scheme: ${mode};\n}`;
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme.surfaceContainer);
}
