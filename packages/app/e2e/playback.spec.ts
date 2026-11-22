import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = (name: string): string => fileURLToPath(new URL(`./out/${name}`, import.meta.url));

/** Where the viewer's map style is kept (ui/periodStyle.ts STYLE_KEY). */
const STYLE_KEY = 'wwi-sim.mapStyle';

/**
 * The period style is the default (Task 20). The tests written for the plain trench map read its clock text, key and
 * labels, so they start in the plain style; the period style's own tests (titled "period style …") start as a new viewer.
 */
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith('period style')) return;
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, 'plain');
    } catch {
      /* storage blocked: the app falls back to the period style */
    }
  }, STYLE_KEY);
});

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

test.describe('Vimy: the battle on the map, totals and the why panel', () => {
  const vimy = (): {
    endMinute: number;
    summary: { casualties: { battle: Record<'allied' | 'central', { killed: number; wounded: number; captured: number }> }; prisoners: Record<'allied' | 'central', number>; gunsCaptured: number };
  } => JSON.parse(readFileSync(fileURLToPath(new URL('../public/runs/vimy.json', import.meta.url)), 'utf8'));
  const count = async (page: Page, id: string): Promise<number> => Number((await page.getByTestId(id).innerText()).replace(/[^\d]/g, ''));

  test('totals rise during the Vimy run, to the summary at its end', async ({ page }) => {
    await page.goto('/?run=vimy');
    const time = page.getByLabel('Battle time');
    await expect(page.getByTestId('totals')).toBeVisible();
    const at = async (m: number) => {
      await time.fill(String(m));
      return { allied: await count(page, 'totals-casualties-allied'), central: await count(page, 'totals-casualties-central'), guns: await count(page, 'totals-guns') };
    };
    const zero = await at(0);
    const morning = await at(120);
    const noon = await at(390);
    expect(morning.allied).toBeGreaterThan(zero.allied);
    expect(morning.central).toBeGreaterThan(zero.central);
    expect(noon.allied).toBeGreaterThan(morning.allied);
    const r = vimy();
    const end = await at(r.endMinute);
    const sum = (s: 'allied' | 'central') => r.summary.casualties.battle[s].killed + r.summary.casualties.battle[s].wounded + r.summary.casualties.battle[s].captured;
    expect(end.allied).toBe(sum('allied'));
    expect(end.central).toBe(sum('central'));
    expect(end.guns).toBe(r.summary.gunsCaptured);
    expect(await count(page, 'totals-prisoners-allied')).toBe(r.summary.prisoners.allied);
  });

  test('clicking an event opens the why panel with at least one cause line; a step moves the playhead', async ({ page }) => {
    await page.goto('/?run=vimy');
    const clock = page.getByTestId('battle-clock');
    const log = page.getByRole('region', { name: /Event log/ });
    await log.getByRole('listitem').filter({ hasText: 'is pinned' }).first().click();
    const panel = page.getByRole('dialog', { name: /Why\?/ });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.why-cause').first()).toBeVisible();
    expect(await panel.locator('.why-cause').count()).toBeGreaterThanOrEqual(1);
    // A step further down the chain jumps the playhead to its minute.
    const steps = panel.locator('.why-event');
    expect(await steps.count()).toBeGreaterThan(1);
    const before = await clock.innerText();
    const last = steps.last();
    const minute = Number(await last.getAttribute('data-minute'));
    await last.click();
    await expect(page.getByLabel('Battle time')).toHaveValue(String(minute));
    if (minute !== 0) expect(await clock.innerText()).not.toBe('');
    expect(before).not.toBe('');
    await page.getByRole('button', { name: 'Close why panel' }).click();
    await expect(panel).toHaveCount(0);
  });

  test('clicking a battalion on the map opens its why chain', async ({ page }) => {
    await page.goto('/?run=vimy');
    await page.getByLabel('Battle time').fill('120');
    const map = page.getByRole('img', { name: /^Trench map of / });
    const box = (await map.boundingBox())!;
    // Try points across the middle of the sheet until one lands on a marker.
    const panel = page.getByRole('dialog', { name: /Why\?/ });
    for (let i = 0; i < 60 && (await panel.count()) === 0; i++) {
      await map.click({ position: { x: box.width * (0.3 + 0.4 * ((i * 7) % 60) / 60), y: box.height * (0.25 + 0.5 * (i % 10) / 10) } });
    }
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/battalion/i);
  });

  const SHOTS: Array<[name: string, minute: number]> = [
    ['zero', 0],
    ['0700', 90],
    ['1200', 390],
    ['0409-2000', 870],
    ['0412-0500', 4290],
  ];

  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`screenshots at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/?run=vimy');
      await expect(page.getByTestId('battle-clock')).toBeVisible();
      for (const [name, minute] of SHOTS) {
        await page.getByLabel('Battle time').fill(String(minute));
        await page.waitForTimeout(300);
        await page.screenshot({ path: out(`task-18-${name}-${width}.png`), fullPage: width < 600 });
      }
      // Zoomed in on the middle of the front, to companies, at 07:00 and 12:00.
      const map = page.getByRole('img', { name: /^Trench map of / });
      await page.getByLabel('Battle time').fill('90');
      await map.scrollIntoViewIfNeeded();
      for (let i = 0; i < 12 && (await map.getAttribute('data-detail')) !== 'company'; i++) {
        const b = (await map.boundingBox())!;
        await page.mouse.move(b.x + b.width * 0.47, b.y + b.height * 0.55);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(60);
      }
      await expect(map).toHaveAttribute('data-detail', 'company');
      await page.waitForTimeout(400);
      // Not full-page: a full-page shot resizes the viewport, and a resize returns the map to fit-all.
      await page.screenshot({ path: out(`task-18-0700-zoom-${width}.png`) });
      await page.getByLabel('Battle time').fill('390');
      await page.waitForTimeout(300);
      await expect(map).toHaveAttribute('data-detail', 'company');
      await page.screenshot({ path: out(`task-18-1200-zoom-${width}.png`) });
      await page.getByRole('button', { name: 'Fit all' }).click();
      await page.getByLabel('Battle time').fill('120');
      await page.getByRole('region', { name: /Event log/ }).getByRole('listitem').filter({ hasText: 'is pinned' }).first().click();
      await expect(page.getByRole('dialog', { name: /Why\?/ })).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({ path: out(`task-18-why-${width}.png`) });
    });
  }
});

test('period style is the default: the Explanatory Notes and the cartouche frame the map, never over it', async ({ page }) => {
  await page.goto('/?run=vimy');
  const notes = page.getByRole('group', { name: 'Explanatory Notes' });
  const cartouche = page.getByRole('group', { name: 'Title cartouche' });
  await expect(notes).toBeVisible();
  await expect(cartouche).toBeVisible();
  await expect(cartouche).toContainText('Vimy Ridge');
  await expect(notes).toContainText('1st Canadian Division');
  await expect(page.getByTestId('battle-clock')).toHaveText('Monday, 9th April · 5.30 a.m.');
  await expect(page.getByRole('checkbox', { name: 'Period style' })).toBeChecked();
  // The frame's totals give each side's prisoners apart, as the side panel does.
  await page.getByLabel('Battle time').fill('870');
  await expect(page.locator('.period-totals')).toContainText(/Prisoners taken · Allied [\d,]+ · German [\d,]+/);
  await page.getByLabel('Battle time').fill('0');
  // The frame is laid out round the map: neither panel covers it.
  const map = (await page.getByRole('img', { name: /^Trench map of / }).boundingBox())!;
  for (const panel of [notes, cartouche]) {
    const b = (await panel.boundingBox())!;
    const apart = b.x >= map.x + map.width - 0.5 || b.x + b.width <= map.x + 0.5 || b.y >= map.y + map.height - 0.5 || b.y + b.height <= map.y + 0.5;
    expect(apart).toBe(true);
  }
  // The Notes fold away.
  await page.getByText('Explanatory Notes', { exact: true }).click();
  await expect(notes).toBeHidden();
});

test('period style switched off shows the plain trench map; the choice survives a reload', async ({ page }) => {
  await page.goto('/?run=vimy');
  await expect(page.getByRole('group', { name: 'Explanatory Notes' })).toBeVisible();
  await page.getByText('Period style', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Explanatory Notes' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Title cartouche' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Map key' })).toBeVisible();
  await expect(page.getByTestId('battle-clock')).toHaveText('Mon 9 Apr · 05:30');
  await page.reload();
  await expect(page.getByTestId('battle-clock')).toHaveText('Mon 9 Apr · 05:30');
  await expect(page.getByRole('group', { name: 'Explanatory Notes' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Period style' })).not.toBeChecked();
  // And back again.
  await page.getByText('Period style', { exact: true }).click();
  await page.reload();
  await expect(page.getByRole('group', { name: 'Explanatory Notes' })).toBeVisible();
});

test('period style still renders when browser storage throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('blocked'); } });
  });
  await page.goto('/?run=sample');
  await expect(page.getByRole('group', { name: 'Title cartouche' })).toBeVisible();
  await page.getByText('Period style', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Map key' })).toBeVisible();
});

test('period style at phone width: the cartouche above the map, the Notes below it, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?run=vimy');
  const map = (await page.getByRole('img', { name: /^Trench map of / }).boundingBox())!;
  const cart = (await page.getByRole('group', { name: 'Title cartouche' }).boundingBox())!;
  const notes = (await page.getByRole('group', { name: 'Explanatory Notes' }).boundingBox())!;
  expect(cart.y + cart.height).toBeLessThanOrEqual(map.y);
  expect(notes.y).toBeGreaterThanOrEqual(map.y + map.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
