import { test, expect } from '@playwright/test';
test.use({ storageState: 'e2e/.auth/admin.json' });
const stops = ['Temple', 'Lunch'].map((name, i) => ({ id: `audit-${i}`, kind: 'custom', name, lat: 13.75 + i / 100, lng: 100.5, durationMin: 60, priority: 'must' }));
const input = { id: 'audit-test', title: 'Audit trip', area: '', tripDate: '2027-12-01', startTime: '08:00', pickupText: 'Original hotel', pickupLat: 13.75, pickupLng: 100.5, endText: null, endLat: null, endLng: null, durationHours: 8, adults: 2, children: 0, bags: 0, vehicle: 'economy_sedan', language: 'en', customerName: null, customerEmail: null, customerPhone: null, notes: null, stops, transportPrice: 2500, discount: 0, holdDays: 7, isTemplate: false, templateName: null };
const plan = { stops, plan: { stops: [], returnAt: 960, returnTravel: 0, problems: [], totalDrive: 0, totalWait: 0, totalActivity: 120, overBy: 0 }, source: 'estimate', fees: { included: 0, onSite: 0 }, total: 2500, suggestedTransport: null, packing: [], alternatives: [] };
async function fixture(page: import('@playwright/test').Page) {
  await page.route('**/api/admin/attractions', (r) => r.fulfill({ json: { attractions: [] } }));
  await page.route('**/api/admin/trips/audit-test', (r) => r.fulfill({ json: { input, trip: { ...input, ref: 'TP-AUDIT', status: 'draft', updatedAt: '2026-10-24T00:00:00.000Z' }, versions: [], group: [] } }));
  await page.route('**/api/admin/trips/plan', (r) => r.fulfill({ json: plan }));
  await page.goto('/admin/trips/audit-test');
  await expect(page.getByLabel('Trip name')).toHaveValue('Audit trip');
}

test('failed saves stop follow-up actions and preserve staff edits', async ({ page }) => {
  await fixture(page);
  let actions = 0;
  await page.route('**/api/admin/trips/audit-test', async (r) => {
    if (r.request().method() === 'POST') { actions++; await r.fulfill({ json: { ok: true } }); }
    else await r.fallback();
  });
  await page.route('**/api/admin/trips', (r) => r.fulfill({ status: 409, json: { error: 'Trip changed in another session.' } }));
  await page.getByLabel('Trip name').fill('My unsaved edits');
  await page.getByRole('button', { name: '+ Add day', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Trip changed in another session.');
  await expect(page.getByLabel('Trip name')).toHaveValue('My unsaved edits');
  expect(actions).toBe(0);
});

test('editing an address clears old coordinates and round-trip planning clears the old drop-off', async ({ page }) => {
  await fixture(page);
  const pickup = page.getByPlaceholder('Hotel or address');
  await pickup.fill('New hotel');
  await expect(page.getByText('Pick a suggestion so drive times can be worked out')).toBeVisible();
  const planned = page.waitForRequest((r) => r.url().endsWith('/api/admin/trips/plan') && r.postDataJSON().pickupText === 'New hotel');
  const req = await planned;
  expect(req.postDataJSON().pickupLat).toBeNull();
  expect(req.postDataJSON().pickupLng).toBeNull();
  expect(req.postDataJSON().endLat).toBeNull();
});

test('touch reorder controls are usable and the page has no horizontal overflow', async ({ page }) => {
  await fixture(page);
  const steps = page.getByRole('button', { name: '2 Stops (2)' });
  if (await steps.isVisible()) await steps.click();
  const cards = page.locator('li[draggable]');
  await expect(cards).toHaveCount(2);
  const down = cards.first().getByRole('button', { name: 'Move down' });
  const box = await down.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await down.click();
  await expect(cards.first()).toContainText('Lunch');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('a delayed auto-arrange response cannot replace newer destination edits', async ({ page }) => {
  await fixture(page);
  const arrange = page.getByRole('button', { name: 'Auto-arrange', exact: true });
  await expect(arrange).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/admin/trips/plan', async (r) => {
    if (r.request().postDataJSON().arrange) { await gate; await r.fulfill({ json: { ...plan, stops: [...stops].reverse() } }); }
    else await r.fallback();
  });
  const requested = page.waitForRequest((r) => r.url().endsWith('/trips/plan') && r.postDataJSON().arrange);
  await arrange.click();
  await requested;
  const steps = page.getByRole('button', { name: '2 Stops (2)' });
  if (await steps.isVisible()) await steps.click();
  const cards = page.locator('li[draggable]');
  await cards.first().getByText('Temple', { exact: true }).click();
  const next = page.waitForRequest((r) => r.url().endsWith('/trips/plan') && !r.postDataJSON().arrange && r.postDataJSON().stops[0].durationMin === 90);
  await cards.first().getByLabel('Minutes', { exact: true }).fill('90');
  release();
  await next;
  await expect(cards.first()).toContainText('Temple');
  await expect(cards.first().getByLabel('Minutes', { exact: true })).toHaveValue('90');
});

test('edits made during a save stay in the form for the next save', async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/admin/trips', async (r) => { await gate; await r.fulfill({ json: { id: 'audit-test', ref: 'TP-AUDIT' } }); });
  await page.getByLabel('Trip name').fill('First edit');
  const requested = page.waitForRequest((r) => r.url().endsWith('/api/admin/trips') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await requested;
  await page.getByLabel('Trip name').fill('Newer edit while saving');
  release();
  await expect(page.getByText('The saved version is safe. You have newer edits; save again before continuing.')).toBeVisible();
  await expect(page.getByLabel('Trip name')).toHaveValue('Newer edit while saving');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});
