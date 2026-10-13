import { expect, test } from '@playwright/test';
import { signIn } from './support';

test('invoice form mounts its three lazy custom elements', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  const bad: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) bad.push(`${response.status()} ${response.url()}`);
  });

  await signIn(page);

  // The auth gate probes GET /account on /login too, where a 401 is the point:
  // nothing is signed in yet. Everything below is recorded fresh so the
  // assertion only judges the invoice page.
  bad.length = 0;
  errors.length = 0;

  await page.goto('/invoice/new');
  await page.getByRole('button', { name: 'Klasik Bawaan' }).click();
  await expect(page.locator('notain-items-grid')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('notain-picker').first()).toBeVisible();
  await expect(page.locator('notain-calc-inspector')).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  expect(bad, 'tak ada request gagal setelah login').toEqual([]);
  expect(
    errors.filter((text) => !text.includes('favicon')),
    bad.join('\n'),
  ).toEqual([]);
});
