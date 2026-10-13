import type { Page } from '@playwright/test';

/**
 * Shared browser helpers. These specs run against the background dev server,
 * and every route they touch sits behind `AuthGate`, so signing in first is
 * the price of entry everywhere.
 */

const EMAIL = 'notain-smoke-a@example.com';
const PASSWORD = 'NotainSmoke12345!';

/** Signs the smoke account in and waits for the app shell. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
}
