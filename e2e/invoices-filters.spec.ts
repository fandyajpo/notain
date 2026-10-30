import { expect, test, type Page } from '@playwright/test';
import { AUTH_STATE, signIn } from './support';

test.use({ storageState: AUTH_STATE });

/**
 * The `/invoices` toolbar keeps every filter and the sort in the query string
 * (`keyword`, `status`, `template`, `sort`, `dir`) so the state survives a
 * reload, the back button and a pasted link.
 *
 * The page tour auto-runs on a fresh profile and its Driver.js overlay eats
 * every pointer event (SVG hit-test), so anything that clicks first closes the
 * tour — Escape marks it done for this browser profile, which is also what a
 * real user pressing it does.
 */

async function closeTour(page: Page): Promise<void> {
  const popover = page.locator('.driver-popover');
  try {
    await popover.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    return; // tour never ran (already completed for this profile)
  }
  await page.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden', timeout: 5_000 });
}

/**
 * The table (and with it the sortable headers) only renders once at least one
 * invoice exists. Sorting tests need a row, so they make sure there is one —
 * the same UI flow a user would take, tour and all.
 */
async function ensureInvoiceExists(page: Page): Promise<void> {
  await page.goto('/invoices');
  await closeTour(page);
  if ((await page.locator('tbody tr').count()) > 0) return;

  await page.goto('/invoice/new');
  await page.waitForTimeout(1_800);
  await closeTour(page);
  await page.getByRole('button', { name: 'Klasik Bawaan' }).click();
  // The builder mounts a second tour (invoice-create) on top of the pick step.
  await page.waitForTimeout(1_500);
  await closeTour(page);
  await page.getByLabel('Nama pelanggan *').fill('Smoke Filters');
  await page.getByRole('button', { name: 'Simpan invoice' }).first().click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('seeds the filters from the URL instead of starting blank', async ({ page }) => {
  await page.goto('/invoices?keyword=budi&status=paid');

  await expect(page.getByLabel('Cari invoice')).toHaveValue('budi', { timeout: 20_000 });
  // The status select renders the label of the value it was seeded with.
  await expect(page.getByRole('combobox', { name: 'Filter status' })).toContainText('Lunas');
  // The seeding must not eat the params it just read back.
  await expect(page).toHaveURL(/keyword=budi/);
  await expect(page).toHaveURL(/status=paid/);
});

test('writes filter changes into the URL and keeps foreign params', async ({ page }) => {
  await page.goto('/invoices?utm_campaign=wa');
  await closeTour(page);

  await page.getByLabel('Cari invoice').fill('kopiko');
  await expect(page).toHaveURL(/keyword=kopiko/, { timeout: 10_000 });

  await page.getByRole('combobox', { name: 'Filter status' }).click();
  await page.getByRole('option', { name: 'Batal' }).click();
  await expect(page).toHaveURL(/status=void/);

  // Params this page does not own are left exactly where they were.
  await expect(page).toHaveURL(/utm_campaign=wa/);

  // Clearing a filter removes its param rather than writing an empty value.
  await page
    .getByRole('combobox', { name: 'Filter status' })
    .locator('..')
    .getByLabel('Hapus pilihan')
    .click();
  await expect(page).not.toHaveURL(/status=/);
  await expect(page).toHaveURL(/utm_campaign=wa/);
});

test('round-trips the "Belum dikirim" (unset) status filter', async ({ page }) => {
  await page.goto('/invoices?status=unset');
  await closeTour(page);

  // The sentinel re-seeds the select instead of being read as junk.
  await expect(page.getByRole('combobox', { name: 'Filter status' })).toContainText(
    'Belum dikirim',
    { timeout: 20_000 },
  );
  await expect(page).toHaveURL(/status=unset/);

  // Server-side proof: the unset bucket is a real filter, not "no filter" —
  // a set-status invoice (the account's long-standing "Lunas" one) must not
  // slip into the rows behind it.
  await expect(page.locator('tbody tr').filter({ hasText: 'Lunas' })).toHaveCount(0);

  // Clearing from the select drops the param rather than writing it empty…
  await page
    .getByRole('combobox', { name: 'Filter status' })
    .locator('..')
    .getByLabel('Hapus pilihan')
    .click();
  await expect(page).not.toHaveURL(/status=/);

  // …and picking the unset option writes the sentinel back.
  await page.getByRole('combobox', { name: 'Filter status' }).click();
  await page.getByRole('option', { name: 'Belum dikirim' }).click();
  await expect(page).toHaveURL(/status=unset/);
});

test('round-trips the template filter through reload', async ({ page }) => {
  await page.goto('/invoices');
  await closeTour(page);

  await page.getByRole('combobox', { name: 'Filter template' }).click();
  await page.getByRole('option', { name: 'Klasik' }).click();
  await expect(page).toHaveURL(/template=classic/);

  await page.reload();
  await closeTour(page);
  // The select is re-seeded from the query, not reset to "all templates".
  await expect(page.getByRole('combobox', { name: 'Filter template' })).toContainText('Klasik');
  await expect(page).toHaveURL(/template=classic/);
});

test('keeps the sort in the URL', async ({ page }) => {
  await ensureInvoiceExists(page);
  await page.goto('/invoices');
  await closeTour(page);

  await page.getByRole('button', { name: /^Total/ }).click();
  await expect(page).toHaveURL(/sort=total/);
  await expect(page).toHaveURL(/dir=(asc|desc)/);

  await page.reload();
  await closeTour(page);
  await expect(page).toHaveURL(/sort=total/);
});
