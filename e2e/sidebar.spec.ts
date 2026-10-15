import { expect, test } from '@playwright/test';
import { signIn } from './support';

/**
 * The desktop sidebar collapses via `html[data-sidebar]`, a preference kept in
 * localStorage. The ClientRouter's swap drops every `<html>` attribute on soft
 * navigation, so the layout must re-apply the preference from storage after
 * each swap — otherwise the rail snaps open on every menu click even though
 * the stored preference still says "closed".
 */
test('sidebar collapse survives soft navigation and hard reloads', async ({ page }) => {
  await signIn(page);
  const html = page.locator('html');
  const toggle = page.locator('#sidebar-toggle');

  await expect(html).toHaveAttribute('data-sidebar', 'open');

  await toggle.click();
  await expect(html).toHaveAttribute('data-sidebar', 'closed');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // Soft navigation: the ClientRouter swaps documents without a full load.
  // Scoped to the desktop sidebar — the mobile drawer renders the same links.
  await page.locator('#app-sidebar a[data-nav-link][href="/invoices"]').click();
  await page.waitForURL('**/invoices');
  await expect(html).toHaveAttribute('data-sidebar', 'closed');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  // A hard reload restores the same preference from storage.
  await page.reload();
  await expect(html).toHaveAttribute('data-sidebar', 'closed');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
