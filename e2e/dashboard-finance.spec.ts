import { test, expect } from '@playwright/test';
import { signIn } from './support';

/**
 * The dashboard's money screen against the dev backend: the finance section
 * must render real aggregated numbers, the period filter must re-scope them,
 * and the attention/activity lists must appear only when they have content.
 */
test('dashboard finance section: cards, chart, period filter', async ({ page }) => {
  const bad: string[] = [];
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('localhost'))
      bad.push(`http ${r.status()} ${r.url()}`);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  // The welcome tour may overlay the first visit; dismiss it if present.
  const popover = page.locator('.driver-popover');
  try {
    await popover.waitFor({ state: 'visible', timeout: 5_000 });
    await page.keyboard.press('Escape');
    await popover.waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    // no tour for this account — fine
  }

  const finance = page.locator('[data-tour="dash-finance"]');
  await finance.waitFor({ state: 'visible', timeout: 20_000 });

  // The four cards, with money and counts rendered in their own shapes.
  await expect(finance.getByText('Pendapatan diterima')).toBeVisible();
  await expect(finance.getByText('Belum dibayar')).toBeVisible();
  await expect(finance.getByText('Jatuh tempo lewat')).toBeVisible();
  await expect(finance.getByText('Invoice dibuat')).toBeVisible();
  // A real Rupiah amount, not a zeroed skeleton.
  await expect(finance.getByText(/Rp[\d.]+/).first()).toBeVisible();

  // The chart draws its six month buckets.
  await expect(finance.locator('[role="img"] > div')).toHaveCount(6);

  // Period filter: switching to "Minggu ini" keeps the section alive.
  await page.getByRole('button', { name: 'Minggu ini' }).click();
  await expect(finance.getByText('Pendapatan diterima')).toBeVisible();

  // "Kustom" reveals the date range inputs, sized to the control scale.
  await page.getByRole('button', { name: 'Kustom' }).click();
  const dates = finance.locator('input[type="date"]');
  await expect(dates).toHaveCount(2);
  const heights = await dates.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  );
  expect(heights).toEqual([40, 40]);

  expect(bad).toEqual([]);
});

test('dashboard finance: attention and activity gate on content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  const finance = page.locator('[data-tour="dash-finance"]');
  await finance.waitFor({ state: 'visible', timeout: 20_000 });

  // Both lists are conditional: they render only with rows, and the page
  // never shows a broken empty shell for either.
  for (const tour of ['dash-attention', 'dash-activity']) {
    const section = page.locator(`[data-tour="${tour}"]`);
    if ((await section.count()) > 0) {
      await expect(section.locator('li').first()).toBeVisible();
    }
  }

  // When the attention list is present, its WhatsApp links carry a real
  // pre-filled reminder (only for invoices with a phone number).
  const attention = page.locator('[data-tour="dash-attention"]');
  if ((await attention.count()) > 0) {
    const waLinks = attention.locator('a[href^="https://wa.me/"]');
    const count = await waLinks.count();
    for (let index = 0; index < count; index += 1) {
      const href = await waLinks.nth(index).getAttribute('href');
      expect(href).toContain('text=');
    }
  }
});
