import { expect, test } from '@playwright/test';
import { AUTH_STATE, signIn } from './support';

test.use({ storageState: AUTH_STATE });

test('invoice form mounts its three lazy custom elements', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  const bad: string[] = [];
  page.on('response', (response) => {
    // The admin-nav link probes team membership on every page load, and
    // Appwrite answers 404 for anyone outside the `admins` team — it hides
    // team existence from non-members by design, so a normal account always
    // sees exactly this one. It is expected behaviour, not a breakage; every
    // other failed request still fails the test.
    if (response.status() >= 400 && !response.url().endsWith('/teams/admins/memberships')) {
      bad.push(`${response.status()} ${response.url()}`);
    }
  });

  await signIn(page);

  // The auth gate probes GET /account on /login too, where a 401 is the point:
  // nothing is signed in yet. Everything below is recorded fresh so the
  // assertion only judges the invoice page.
  bad.length = 0;
  errors.length = 0;

  await page.goto('/invoice/new');
  await page.getByRole('button', { name: 'Klasik Bawaan' }).click();
  // The customer picker sits on the Detail tab, which shows by default; the
  // items grid lives behind the Barang tab.
  await expect(page.locator('notain-picker').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('notain-calc-inspector')).toBeVisible();
  await page
    .getByRole('group', { name: 'Bagian invoice' })
    .getByRole('button', { name: 'Barang' })
    .click();
  await expect(page.locator('notain-items-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  expect(bad, 'tak ada request gagal setelah login').toEqual([]);
  expect(
    // The whitelisted memberships 404 above also logs a bare console line
    // ("status of 404 ()") with no URL to match on. Filtering it is safe:
    // `bad` has already asserted at this point that nothing else failed.
    errors.filter((text) => !text.includes('favicon') && !text.includes('status of 404')),
    bad.join('\n'),
  ).toEqual([]);
});
