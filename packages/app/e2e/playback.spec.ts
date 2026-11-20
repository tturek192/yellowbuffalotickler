import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = (name: string): string => fileURLToPath(new URL(`./out/${name}`, import.meta.url));

test('plays, scrubs and jumps from the event log', async ({ page }) => {
  await page.goto('/?run=sample');
  await expect(page.getByText('Draft — unverified data')).toBeVisible();
  const clock = page.getByTestId('battle-clock');
  await expect(clock).toHaveText('Mon 9 Apr · 05:30');
  await page.getByRole('button', { name: '1 s = 1 h', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(clock).not.toHaveText('Mon 9 Apr · 05:30', { timeout: 3000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('listitem').filter({ hasText: 'Black Line taken' }).click();
  await expect(clock).toHaveText(/Mon 9 Apr · 06:\d\d/);
  await page.getByLabel('Battle time').fill('0');
  await expect(clock).toHaveText('Mon 9 Apr · 05:30');
  await page.screenshot({ path: out('playback.png') });

  // Extra look at mid-battle for the visual check.
  await page.getByLabel('Battle time').fill('300');
  await expect(clock).toHaveText('Mon 9 Apr · 10:30');
  await page.screenshot({ path: out('playback-mid.png') });
});

test('stops at the end and restarts from zero', async ({ page }) => {
  await page.goto('/?run=sample');
  const clock = page.getByTestId('battle-clock');
  const end = await page.getByLabel('Battle time').getAttribute('max');
  await page.getByLabel('Battle time').fill(String(Number(end) - 1));
  await page.getByRole('button', { name: '1 s = 1 h', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByLabel('Battle time')).toHaveValue(String(end));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(clock).toHaveText(/Mon 9 Apr · 0[5-6]:\d\d/);
});

test('steps between events with Back and Forward', async ({ page }) => {
  await page.goto('/?run=sample');
  const clock = page.getByTestId('battle-clock');
  await page.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:00');
  await page.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:02');
  await page.getByRole('button', { name: 'Previous event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:00');
});

test('fits a phone-width screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?run=sample');
  await page.getByLabel('Battle time').fill('100');
  await expect(page.getByTestId('battle-clock')).toHaveText('Mon 9 Apr · 07:10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: out('playback-narrow.png'), fullPage: true });
});
