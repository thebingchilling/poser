import { expect, test, type Locator, type Page } from '@playwright/test';

/** Headless Chromium doesn't report itself as Chrome; click through that gate if it shows. */
async function passBrowserGate(page: Page) {
  const cont = page.getByRole('button', { name: /Continue anyway/ });
  const next = page
    .getByRole('button', { name: 'I am 18 or older' })
    .or(page.getByRole('heading', { name: /Locked|Safe Mode/ }))
    .or(page.getByLabel('3D viewport'));
  await cont.or(next).first().waitFor();
  if (await cont.isVisible()) await cont.click();
}

/**
 * Clicks work even on covered elements (Radix disables pointer events behind
 * modal dialogs), so check what is actually painted: a screenshot of a
 * covered element is one flat colour and compresses to almost nothing.
 */
async function expectPainted(locator: Locator) {
  const png = await locator.screenshot();
  expect(png.length, 'element looks blank or covered').toBeGreaterThan(4000);
}

/** Get through the startup gates of a fresh profile. */
async function start(page: Page) {
  await page.goto('/');
  await passBrowserGate(page);
  await expectPainted(page.getByRole('dialog', { name: 'Adults only' }));
  await page.getByRole('button', { name: 'I am 18 or older' }).click();
  await expectPainted(page.getByRole('dialog', { name: 'Set an app lock?' }));
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByLabel('3D viewport')).toBeVisible();
}

async function figureCount(page: Page) {
  return page.evaluate(async () => {
    const req = indexedDB.open('poser');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const rows: { json: string }[] = await new Promise((r) => {
      const q = db.transaction('projects').objectStore('projects').getAll();
      q.onsuccess = () => r(q.result);
    });
    db.close();
    const project = JSON.parse(rows[0]!.json).project;
    return project.scenes[0].figures.length as number;
  });
}

test('opens with a figure, edits, saves, and reloads', async ({ page }, info) => {
  await start(page);
  await page.screenshot({ path: info.outputPath('start.png') });

  // Add a second figure through the extended FAB.
  await page.getByRole('button', { name: 'Add figure' }).click();
  await page.getByRole('menuitem', { name: 'Male figure', exact: true }).click();
  await expect.poll(() => figureCount(page), { timeout: 10_000 }).toBe(2);

  // Undo and redo.
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Undid: Add male figure')).toBeVisible();
  await expect.poll(() => figureCount(page), { timeout: 10_000 }).toBe(1);
  await page.keyboard.press('Control+y');
  await expect.poll(() => figureCount(page), { timeout: 10_000 }).toBe(2);

  // Reload: the scene comes back from IndexedDB.
  await page.reload();
  await passBrowserGate(page);
  await expect(page.getByLabel('3D viewport')).toBeVisible();
  if (info.project.name === 'desktop') {
    await expect(page.getByText('Male figure', { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('reloaded.png') });
});

test('shows placeholder anatomy layers', async ({ page }, info) => {
  await start(page);
  await page.getByRole('button', { name: 'Body' }).first().click();
  await page.getByRole('switch', { name: /Skeleton/ }).click();
  await page.getByRole('switch', { name: /Muscle/ }).click();
  const opacity = page.getByRole('textbox', { name: 'Skin opacity' });
  await opacity.fill('25');
  await opacity.press('Enter');
  await expect(page.getByRole('slider', { name: 'Skin opacity' })).toHaveAttribute('aria-valuenow', '0.25');
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('anatomy.png') });
});

test('settings open with every section', async ({ page }, info) => {
  await start(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  for (const tab of ['Appearance', 'Quality', 'Privacy', 'Storage', 'Install', 'Diagnostics']) {
    await page.getByRole('tab', { name: tab }).click();
  }
  await expect(page.getByText('Renderer', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('settings.png') });
});

test('Safe Mode after a crash mid-load', async ({ page }) => {
  await start(page);
  // Simulate the tab dying while loading.
  await page.evaluate(() => localStorage.setItem('poser.loadingStarted', JSON.stringify({ task: 'Opening the last project' })));
  await page.reload();
  await passBrowserGate(page);
  await expect(page.getByRole('heading', { name: 'Safe Mode' })).toBeVisible();
  await expectPainted(page.getByRole('dialog', { name: 'Safe Mode' }));
  await page.getByRole('button', { name: 'Open at low quality' }).click();
  await expect(page.getByText('Safe Mode: lowest quality after a crash.')).toBeVisible();
});

test('app lock', async ({ page }) => {
  await page.goto('/');
  await passBrowserGate(page);
  await page.getByRole('button', { name: 'I am 18 or older' }).click();
  await page.getByLabel('PIN or passphrase').fill('2468');
  await page.getByLabel('Repeat it').fill('2468');
  await page.getByRole('button', { name: 'Set lock' }).click();
  // Snackbars queue, so this can wait behind the first-run quality message.
  await expect(page.getByText('App lock set')).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await passBrowserGate(page);
  await expect(page.getByRole('heading', { name: 'Locked' })).toBeVisible();
  await expectPainted(page.locator('form.gate__card'));
  await page.getByLabel('PIN or passphrase').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Wrong PIN or passphrase')).toBeVisible();
  await page.getByLabel('PIN or passphrase').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByLabel('3D viewport')).toBeVisible();
});
