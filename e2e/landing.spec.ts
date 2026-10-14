import { expect, test } from '@playwright/test';

test('landing page renders and hydrates without errors', async ({ page }) => {
  const errors: string[] = [];
  const moduleStatuses: string[] = [];

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    // Matches both the dev source (landing-top.tsx) and the hashed build
    // chunk (landing-top.<hash>.js), so the check works against either.
    if (r.url().includes('landing-top')) moduleStatuses.push(String(r.status()));
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('banner').getByRole('link', { name: 'Masuk' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Bikin invoice. Kirim. Selesai.' })).toBeVisible();
  await expect(page.locator('[data-rich-output]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buat Invoice Gratis' }).first()).toBeVisible();

  // The island's module must have actually loaded — a stale dep-optimizer
  // makes this a 504 and hydration dies with a dynamic-import error.
  expect(moduleStatuses.length).toBeGreaterThan(0);
  expect(moduleStatuses).toContain('200');
  expect(errors).toEqual([]);
});
