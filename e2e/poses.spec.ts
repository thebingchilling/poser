import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/');
  const cont = page.getByRole('button', { name: /Continue anyway/ });
  const next = page.getByRole('button', { name: 'I am 18 or older' }).or(page.getByLabel('3D viewport'));
  await cont.or(next).first().waitFor();
  if (await cont.isVisible()) await cont.click();
  await page.getByRole('button', { name: 'I am 18 or older' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByLabel('3D viewport')).toBeVisible();
  // The quality notice would hold back the undo messages checked below.
  const notice = page.getByText(/Quality set to/);
  await notice.waitFor({ timeout: 5000 }).catch(() => {});
  if (await notice.isVisible()) await page.getByRole('button', { name: 'Dismiss' }).click();
}

test('pose library: apply, blend, random, export and re-import', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop only');
  await start(page);
  await page.getByRole('button', { name: 'Poses', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
  // Select the figure by clicking its chest.
  const vp = (await page.getByLabel('3D viewport').boundingBox())!;
  await page.mouse.click(vp.x + vp.width * 0.5, vp.y + vp.height * 0.36);
  await expect(page.getByRole('button', { name: 'Save pose' })).toBeEnabled();

  await page.getByRole('button', { name: 'Kneeling', exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Undid: Pose: Kneeling')).toBeVisible();
  await page.keyboard.press('Control+y');

  // Export the pose as BVH, then import that file back.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export as BVH' }).click();
  const file = await (await download).path();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await (await chooser).setFiles({ name: 'kneel.bvh', mimeType: 'text/plain', buffer: (await import('node:fs')).readFileSync(file) });
  await expect(page.getByRole('img', { name: 'Pose preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Save to Library' }).click();
  await expect(page.getByText('Saved “kneel” to the Library')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: 'My poses' }).click();
  await expect(page.getByRole('button', { name: 'kneel', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('library.png') });

  // Blend two poses and make a random one.
  await page.getByRole('tab', { name: /Blend/ }).click();
  await page.getByRole('button', { name: 'Arms up', exact: true }).click();
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Walking' })).toBeVisible();
  await page.getByRole('button', { name: 'Random pose' }).click();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Undid: Random pose')).toBeVisible();
  await page.screenshot({ path: info.outputPath('blend.png') });
});
