import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const out = (name: string): string => fileURLToPath(new URL(`./out/${name}`, import.meta.url));

/** The map key sits wholly below the map canvas, inside the sheet, so it hides none of the map. */
async function expectKeyClearOfMap(page: Page): Promise<void> {
  const map = await page.getByRole('img', { name: /^Trench map of / }).boundingBox();
  const key = await page.getByRole('group', { name: 'Map key' }).boundingBox();
  expect(map && key).toBeTruthy();
  expect(key!.y).toBeGreaterThanOrEqual(map!.y + map!.height - 0.5);
  expect(key!.x).toBeGreaterThanOrEqual(map!.x - 0.5);
  expect(key!.x + key!.width).toBeLessThanOrEqual(map!.x + map!.width + 0.5);
}

test('plays, scrubs and jumps from the event log', async ({ page }) => {
  await page.goto('/?run=sample');
  await expect(page.getByText('Draft — unverified data')).toBeVisible();
  // No features or terrain in this run: the key keeps to the basics.
  await expect(page.getByRole('group', { name: 'Map key' })).not.toContainText('Wire');
  await expect(page.getByRole('group', { name: 'Map key' })).not.toContainText('Contours');
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
  // The draft's first events: the Black Line reached and taken at 06:02, the barrage pausing at 06:03 (engine 0.3.11 on;
  // the companies' start draws come from their own rng stream).
  await page.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:02');
  await page.getByRole('button', { name: 'Next event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:03');
  await page.getByRole('button', { name: 'Previous event', exact: true }).click();
  await expect(clock).toHaveText('Mon 9 Apr · 06:02');
});

test('fits a phone-width screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?run=sample');
  await page.getByLabel('Battle time').fill('100');
  await expect(page.getByTestId('battle-clock')).toHaveText('Mon 9 Apr · 07:10');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: out('playback-narrow.png'), fullPage: true });
});

test('names a missing run instead of failing to parse the fallback page', async ({ page }) => {
  await page.goto('/?run=no-such-run');
  await expect(page.getByRole('alert')).toHaveText('No run named “no-such-run”.');
});

test('plays a run with map features and German garrisons', async ({ page }) => {
  await page.goto('/?run=garrisons');
  // The key names the feature symbols and contours this run has.
  const key = page.getByRole('group', { name: 'Map key' });
  for (const entry of ['Communication trench', 'Wire', 'Wood', 'Village', 'Road', 'Railway', 'Crater', 'Subway', 'Tunnel', 'Strongpoint', 'Battery', 'Contours (5 m)']) {
    await expect(key).toContainText(entry);
  }
  const map = page.getByRole('img', { name: /^Trench map of / });
  await expectKeyClearOfMap(page);
  const before = await map.getAttribute('aria-label');
  expect(before).toContain('Mon 9 Apr · 05:30');
  await page.screenshot({ path: out('garrisons-start.png') });
  await page.getByRole('button', { name: '1 s = 1 h', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(map).not.toHaveAttribute('aria-label', before!, { timeout: 3000 });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  // Mid-attack, for the visual check: features under the markers, German garrisons holding in red.
  await page.getByLabel('Battle time').fill('120');
  await expect(page.getByTestId('battle-clock')).toHaveText('Mon 9 Apr · 07:30');
  await page.screenshot({ path: out('garrisons-mid.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectKeyClearOfMap(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: out('garrisons-narrow.png'), fullPage: true });
});

test.describe('Vimy markers and zoom', () => {
  test.use({ deviceScaleFactor: 2 });

  /** Record every string the map draws, so the canvas's labels can be asserted on. */
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const seen = new Set<string>();
      (window as unknown as { __drawn: Set<string> }).__drawn = seen;
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (this: CanvasRenderingContext2D, text: string, ...rest: [number, number, number?]) {
        seen.add(String(text));
        return fillText.call(this, text, ...rest);
      };
    });
  });

  const drawn = (page: Page): Promise<string[]> => page.evaluate(() => [...(window as unknown as { __drawn: Set<string> }).__drawn]);
  const forget = (page: Page): Promise<void> => page.evaluate(() => (window as unknown as { __drawn: Set<string> }).__drawn.clear());
  /** A company label such as "16A" or "3/261"; battalion labels never look like this. */
  const isCompanyLabel = (t: string): boolean => /^\d+[A-Z]$/.test(t) || /^\d+\/\d+$/.test(t);

  test('shows battalion markers at corps zoom, and company labels once zoomed in', async ({ page }) => {
    await page.goto('/?run=vimy');
    const map = page.getByRole('img', { name: /^Trench map of / });
    await expect(map).toHaveAttribute('data-detail', 'battalion');
    // At fit-all the battalions are compact chips; their names are placed only where they fit.
    await expect(map).toHaveAttribute('data-marker', 'chip');
    await expect.poll(async () => (await drawn(page)).some((t) => /^\d+$/.test(t))).toBe(true);
    expect((await drawn(page)).filter(isCompanyLabel)).toEqual([]);
    await page.screenshot({ path: out('vimy-fitall.png') });

    // Mid-attack, zooming with the wheel about a point on the map: first to labelled battalion markers.
    await page.getByLabel('Battle time').fill('150');
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
    for (let i = 0; i < 12 && (await map.getAttribute('data-marker')) === 'chip'; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(60);
    }
    await expect(map).toHaveAttribute('data-marker', 'battalion');
    await expect(map).toHaveAttribute('data-detail', 'battalion');
    expect((await drawn(page)).filter(isCompanyLabel)).toEqual([]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('vimy-mid.png') });

    // Then to companies.
    await forget(page);
    for (let i = 0; i < 12 && (await map.getAttribute('data-detail')) !== 'company'; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(60);
    }
    await expect(map).toHaveAttribute('data-detail', 'company');
    await expect(map).toHaveAttribute('data-marker', 'company');
    await expect.poll(async () => (await drawn(page)).some(isCompanyLabel)).toBe(true);
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('vimy-zoomed.png') });

    // Drag pans, and Fit all returns to the corps view.
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45 + 80, box.y + box.height * 0.5 + 30, { steps: 4 });
    await page.mouse.up();
    await expect(map).toHaveAttribute('data-detail', 'company');
    await page.getByRole('button', { name: 'Fit all' }).click();
    await expect(map).toHaveAttribute('data-detail', 'battalion');
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  test('zooms with the buttons, one step at a time, to a limit', async ({ page }) => {
    await page.goto('/?run=vimy');
    const map = page.getByRole('img', { name: /^Trench map of / });
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    for (let i = 0; i < 30 && (await zoomIn.isEnabled()); i++) await zoomIn.click();
    await expect(zoomIn).toBeDisabled();
    await expect(map).toHaveAttribute('data-detail', 'company');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(zoomIn).toBeEnabled();
  });
});
