import { expect, test } from '@playwright/test';

/**
 * `/site/<ownerId>` end to end: the dev middleware (twin of
 * `functions/site/[[id]].ts`) has to hand the browser the shell with the
 * address bar intact, and the island then renders the industry template from
 * `GET /api/site/<ownerId>` — which this suite stubs the same way
 * `e2e/support.ts` stubs Turnstile: the endpoint's own logic is covered by
 * `tests/site-function.test.ts`, while this spec covers the route, the
 * template pick and the client-side states around it.
 */

const OWNER = 'user_smoke_site';

const PAYLOAD = {
  site: {
    businessName: 'Warung Maju Jaya',
    ownerName: 'Budi Santoso',
    phone: '081234567890',
    address: 'Jl. Melati No. 12, Bandung',
    email: 'halo@maju.test',
    businessType: 'warung-makan',
  },
  items: [
    { name: 'Nasi Goreng', kind: 'barang', unit: 'porsi', unitPrice: 25_000 },
    { name: 'Jasa Antar', kind: 'jasa', unitPrice: 10_000 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/site/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PAYLOAD),
    }),
  );
});

test('serves the shell at /site/<ownerId> and renders the warung template', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto(`/site/${OWNER}`);

  // The address bar keeps the id — no redirect, no query string.
  await expect(page).toHaveURL(new RegExp(`/site/${OWNER}$`));
  // Scoped by role+name: the shell ships its own sr-only h1 for the loading
  // moment, and the dev toolbar carries headings of its own.
  await expect(page.getByRole('heading', { level: 1, name: 'Warung Maju Jaya' })).toBeVisible();

  // Template signature: warung's menu board with a formatted price, and the
  // WhatsApp CTA normalized from the profile's phone.
  await expect(page.getByText('Daftar Tersedia')).toBeVisible();
  await expect(page.getByText('25.000')).toBeVisible();
  await expect(page.locator('a[href^="https://wa.me/6281234567890"]').first()).toBeVisible();
  // Contact facts the profile actually has.
  await expect(page.locator('a[href*="google.com/maps"]').first()).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('explains an incomplete link at the bare /site shell', async ({ page }) => {
  await page.goto('/site');
  await expect(page.getByText('Tautan halaman usaha tidak lengkap')).toBeVisible();
});

test('shows the not-found state when the endpoint answers 404', async ({ page }) => {
  await page.unroute('**/api/site/**');
  await page.route('**/api/site/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'not_found', message: 'Halaman usaha tidak ditemukan.' }),
    }),
  );

  await page.goto(`/site/${OWNER}`);
  await expect(page.getByText('Halaman usaha tidak ditemukan')).toBeVisible();
});
