import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Import flow with real files. Test assets are never committed (PLAN.md
 * section 24); point POSER_TEST_ASSETS at a folder holding them.
 */
const ASSETS = process.env.POSER_TEST_ASSETS ?? '';
const has = (...names: string[]) => !!ASSETS && names.every((n) => existsSync(join(ASSETS, n)));

async function start(page: Page) {
  await page.goto('/');
  const cont = page.getByRole('button', { name: /Continue anyway/ });
  const next = page.getByRole('button', { name: 'I am 18 or older' }).or(page.getByLabel('3D viewport'));
  await cont.or(next).first().waitFor();
  if (await cont.isVisible()) await cont.click();
  await page.getByRole('button', { name: 'I am 18 or older' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByLabel('3D viewport')).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).first().click();
}

async function importFiles(page: Page, files: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import files' }).click();
  await (await chooser).setFiles(files.map((f) => join(ASSETS, f)));
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('import', () => {
  const cases: { file: string[]; kind: 'Figure' | 'Prop'; name: string; rig?: RegExp; height?: [number, number] }[] = [
    { file: ['Xbot.glb'], kind: 'Figure', name: 'Xbot', rig: /Mixamo: 16 of 16/, height: [1.6, 1.9] },
    { file: ['Samba Dancing.fbx'], kind: 'Figure', name: 'Samba Dancing', rig: /Mixamo: 16 of 16/, height: [1.4, 2.0] },
    { file: ['vrm1.vrm'], kind: 'Figure', name: 'vrm1', rig: /VRM: 16 of 16/, height: [1.3, 1.9] },
    { file: ['male02.obj', 'male02.mtl'], kind: 'Prop', name: 'male02' },
    { file: ['elf.dae'], kind: 'Prop', name: 'elf' },
    { file: ['slotted_disk.stl'], kind: 'Prop', name: 'slotted disk' },
    { file: ['dolphins.ply'], kind: 'Prop', name: 'dolphins' },
  ];

  for (const c of cases) {
    test(`imports ${c.file[0]}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'desktop only');
      test.skip(!has(...c.file), 'test asset not available');
      await start(page);
      await importFiles(page, c.file);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('radio', { name: c.kind }).or(dialog.getByRole('radio', { name: new RegExp(c.kind) }))).toHaveAttribute('data-state', 'on', { timeout: 30_000 });
      if (c.rig) await expect(dialog.getByText(c.rig)).toBeVisible();
      if (c.height) {
        const text = await dialog.getByText(/^Height:/).innerText();
        const h = Number(/([\d.]+) m/.exec(text)![1]);
        expect(h).toBeGreaterThan(c.height[0]);
        expect(h).toBeLessThan(c.height[1]);
      }
      await page.screenshot({ path: info.outputPath('wizard.png') });
      await dialog.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(page.getByText(new RegExp(`^Imported ${c.name}`))).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.asset-card__title', { hasText: c.name })).toBeVisible();
      // Add it and wait for it to show (the scene framing follows the loaded model).
      await page.locator('.asset-card', { hasText: c.name }).getByRole('button', { name: 'Add' }).click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: info.outputPath('scene.png') });
      const errors = await page.evaluate(() => localStorage.getItem('poser.errorLog'));
      expect(errors ?? '[]').not.toMatch(/load figure|import/);
    });
  }
});
