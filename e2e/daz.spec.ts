import { gzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { library } from '../packages/importers/src/daz/testLibrary';

/**
 * Native Daz import through the wizard, with a small synthetic library
 * (real Daz content can't be committed). The scene's assets are found by
 * file name among the dropped files.
 */
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

const files = Object.entries(library()).map(([path, json]) => ({
  name: path.split('/').pop()!,
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(gzipSync(new TextEncoder().encode(JSON.stringify(json)))),
}));

test('imports a Daz scene, asking for the library when its assets are missing', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await start(page);

  // The scene alone: its figure lives in the content library.
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import files' }).click();
  await (await chooser).setFiles(files.filter((f) => f.name.endsWith('.duf')));
  await expect(page.getByText(/needs files from your Daz content library/)).toBeVisible();
  await expect(page.locator('li', { hasText: 'data/Test Lib/Figure/Fig.dsf' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();

  // With the library files alongside it imports as a figure on the Daz-style rig.
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import files' }).click();
  await (await chooser).setFiles(files);
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: info.outputPath('wizard.png') });
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText('Test', { exact: true }).first()).toBeVisible();

  // The stored model keeps the corrective morph and what drives it.
  const stored = await page.evaluate(async () => {
    const assets = await (await navigator.storage.getDirectory()).getDirectoryHandle('assets');
    for await (const [, dir] of (assets as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }).entries()) {
      const file = await (await dir.getFileHandle('model.glb')).getFile();
      const buf = await file.arrayBuffer();
      const len = new DataView(buf).getUint32(12, true);
      return new TextDecoder().decode(new Uint8Array(buf, 20, len));
    }
    return '';
  });
  expect(stored).toContain('jcm:pJCMAbdomenBend');
  expect(stored).toContain('dazCorrectives');
  expect(stored).not.toContain('sourceVertex');
});
