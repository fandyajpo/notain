import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support';

/**
 * `/invoice/<id>` and `/templates/<id>` have no server route behind them: a
 * Pages Function (and, locally, the middleware in `astro.config.mjs`) hands the
 * browser the edit shell and leaves the address bar alone. The older `…/edit`
 * links are the exception — they get a real redirect onto the canonical URL.
 * These specs pin the contract down on the dev server; the production half is
 * checked again after every deploy.
 */

// A well-formed id that cannot exist, so the lookup is guaranteed to come back
// empty — which is the point: the shell mounted, and the app read the id.
const INVOICE_ID = 'tidak-ada-9f3c2b';
const TEMPLATE_ID = 'tpl_yang_tidak_ada';

/**
 * `/templates/new` ALWAYS opens with the business-type step — that is the
 * contract (every new template picks its trade first, the remembered profile
 * choice merely preselects). Settle it so these specs pin the route contract
 * instead of the onboarding step.
 */
async function settleTemplateEditor(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Lewati, pakai yang umum' });
  await expect(skip).toBeVisible({ timeout: 20_000 });
  await skip.click();
  await expect(page.getByLabel('Nama template')).toBeVisible({ timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('serves the invoice editor at /invoice/<id>, address bar intact', async ({ page }) => {
  await page.goto(`/invoice/${INVOICE_ID}`);

  await expect(page).toHaveURL(new RegExp(`/invoice/${INVOICE_ID}$`));
  // The shell mounted, so the app read the id from the path, looked it up and
  // came back empty — a server-side 404 would never show this copy.
  await expect(page.getByText('Invoice ini mungkin sudah dihapus')).toBeVisible({
    timeout: 20_000,
  });
});

test('serves the template editor at /templates/<id>', async ({ page }) => {
  await page.goto(`/templates/${TEMPLATE_ID}`);

  await expect(page).toHaveURL(new RegExp(`/templates/${TEMPLATE_ID}$`));
  await expect(page.getByText('Template ini tidak ditemukan')).toBeVisible({ timeout: 20_000 });
});

test('redirects the older /invoice/edit link onto the canonical route', async ({ page }) => {
  await page.goto(`/invoice/edit?id=${INVOICE_ID}`);

  await expect(page).toHaveURL(`/invoice/${INVOICE_ID}`);
  await expect(page.getByText('Invoice ini mungkin sudah dihapus')).toBeVisible({
    timeout: 20_000,
  });
});

test('redirects the older /templates/edit link onto /templates/new', async ({ page }) => {
  await page.goto('/templates/edit');

  await expect(page).toHaveURL('/templates/new');
  await settleTemplateEditor(page);
});

test('carries the copy seed through the /templates/edit redirect', async ({ page }) => {
  await page.goto('/templates/edit?from=modern');

  await expect(page).toHaveURL('/templates/new?from=modern');
  await settleTemplateEditor(page);
});

test('switching the business type reseeds Teks default', async ({ page }) => {
  await page.goto('/templates/new');
  await settleTemplateEditor(page);

  await page.getByRole('button', { name: 'Ubah', exact: true }).click();
  await page.getByLabel('Cari jenis usaha').fill('bengkel');
  await page.locator('[data-subtype="bengkel-mobil"]').click();
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();

  // The otomotif preset's opening line lands in the first rich zone…
  await expect(page.locator('[aria-label="Teks pembuka"]')).toContainText(
    'perawatan kendaraan kamu',
  );
  // …the choice is shown on the card, and the name survives the swap.
  await expect(page.getByText('Bengkel Mobil')).toBeVisible();
  await expect(page.getByLabel('Nama template')).toHaveValue('Template baru');
});

test('leaves the routes that are files of their own alone', async ({ page }) => {
  await page.goto('/invoice/new');
  await expect(page.getByRole('button', { name: 'Klasik Bawaan' })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto('/invoice/print');
  await expect(page.getByText('Tidak ada invoice untuk dicetak')).toBeVisible({ timeout: 20_000 });

  await page.goto('/templates/new');
  await settleTemplateEditor(page);
});
