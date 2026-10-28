import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, generateScheme, schemeToCss } from './scheme';

describe('color scheme', () => {
  it('generates every role as hex for both modes', () => {
    for (const dark of [true, false]) {
      const scheme = generateScheme(DEFAULT_SEED, dark);
      for (const hex of Object.values(scheme)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('makes dark surfaces darker than light ones', () => {
    const lum = (hex: string) => parseInt(hex.slice(1), 16) & 0xff;
    expect(lum(generateScheme(DEFAULT_SEED, true).surface)).toBeLessThan(lum(generateScheme(DEFAULT_SEED, false).surface));
  });

  it('writes CSS variables', () => {
    expect(schemeToCss(generateScheme('#336699', true))).toMatch(/--md-sys-color-on-primary-container: #[0-9a-f]{6};/);
  });
});
