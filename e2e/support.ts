import type { Page } from '@playwright/test';

/**
 * Shared browser helpers. These specs run against the background dev server,
 * and every route they touch sits behind `AuthGate`, so signing in first is
 * the price of entry everywhere.
 */

const EMAIL = 'notain-smoke-a@example.test';
const PASSWORD = 'NotainSmoke12345!';

/**
 * Stubs the Cloudflare Turnstile gate for the session.
 *
 * The bot gate is an external service, and in headless Chromium the widget
 * never finishes its challenge — no token, so sign-in cannot proceed. e2e
 * replaces BOTH halves instead of pretending the gate is off: the widget
 * mints a dummy token synchronously (the app still runs its full consume
 * flow), and our `/api/turnstile` verify endpoint answers `success`. The
 * production gate is untouched; Cloudflare's side of it is not this suite's
 * business to test.
 */
async function stubTurnstile(page: Page): Promise<void> {
  await page.route('**/api/turnstile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    }),
  );
  await page.addInitScript(() => {
    (window as unknown as { turnstile?: unknown }).turnstile = {
      render(element: HTMLElement, options: { callback?: (token: string) => void }) {
        element.innerHTML = '<input type="hidden" value="e2e-dummy-token" />';
        // The app only learns the token through the widget's callback — fire
        // it the way the real widget would, just without the challenge.
        setTimeout(() => options.callback?.('e2e-dummy-token'), 0);
        return 'e2e-widget';
      },
      remove() {},
      execute() {},
      getResponse: () => 'e2e-dummy-token',
      isExpired: () => false,
      ready(callback: () => void) {
        callback();
      },
    };
  });
}

/** Signs the smoke account in and waits for the app shell. */
export async function signIn(page: Page, base = ''): Promise<void> {
  await stubTurnstile(page);
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard\/?$/, { waitUntil: 'domcontentloaded' });
}
