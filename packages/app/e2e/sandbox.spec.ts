import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('set up a battle on a phone: place, remove, refuse the river, paint, share', async ({ page }) => {
  await page.goto('/sandbox.html');
  const map = page.getByTestId('sandbox-map');
  await expect(map).toBeVisible();
  await page.getByLabel('Map').selectOption('ridge');
  await page.getByRole('button', { name: 'Load default setup' }).click();
  const box = (await map.boundingBox())!;
  const units = async () => Number(await map.getAttribute('data-units'));
  // place one battalion by tap in an empty spot near the west edge
  await page.getByRole('button', { name: 'Battalion' }).click();
  const before = await units();
  await map.tap({ position: { x: 12, y: box.height - 12 } });
  expect(await units()).toBe(before + 1);
  // long-press removes it
  await page.mouse.move(box.x + 12, box.y + box.height - 12); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  expect(await units()).toBe(before);
  // the river refuses a unit
  await page.getByLabel('Map').selectOption('river');
  await expect(map).not.toHaveAttribute('data-river', '');
  const riverAt = (await map.getAttribute('data-river'))!.split(',').map(Number);
  await map.tap({ position: { x: riverAt[0], y: riverAt[1] } });
  await expect(page.getByRole('alert')).toContainText('river');
  // paint a wood cell
  await page.getByRole('button', { name: 'Paint terrain' }).click();
  await page.getByRole('button', { name: 'Wood', exact: true }).click();
  await map.tap({ position: { x: 30, y: 30 } });
  // share and reload the same setup
  await page.getByRole('button', { name: 'Share link' }).click();
  const url = await page.getByLabel('Share link').inputValue();
  const count = await units();
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ''));
  expect(await units()).toBe(count);
});

test('play the ridge: a barrage nudge shows its clock, the result arrives, and the same seed replays the same', async ({ page }) => {
  await page.goto('/sandbox.html');
  await page.getByLabel('Map').selectOption('ridge');
  await page.getByRole('button', { name: 'Go' }).click();
  await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '16×' }).click();
  await page.getByRole('group', { name: 'Orders' }).getByRole('button', { name: 'Barrage' }).click();
  const map = page.getByTestId('sandbox-play');
  const box = (await map.boundingBox())!;
  await map.tap({ position: { x: box.width * 0.6, y: box.height / 2 } });
  await expect(page.getByLabel('Orders on the way')).toContainText('⏱');
  const result = page.getByLabel('Result');
  await expect(result).toBeVisible({ timeout: 60_000 });
  // Without nudges, the same seed must play out the same way twice.
  const replay = async () => { await page.getByRole('button', { name: 'Replay same seed' }).click(); await expect(result).toBeVisible({ timeout: 60_000 }); return result.textContent(); };
  expect(await replay()).toBe(await replay());
  await page.screenshot({ path: 'e2e/out/sandbox-result.png' });
});
