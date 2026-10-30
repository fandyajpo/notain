import type { BrowserContext, Page } from '@playwright/test';

/**
 * Shared browser helpers. These specs run against the background dev server,
 * so signing in first is the price of entry everywhere.
 */

const EMAIL = 'notain-smoke-a@example.test';
const PASSWORD = 'NotainSmoke12345!';

/**
 * Where `global-setup.ts` persists the suite's single login (cookies +
 * localStorage — the Appwrite `a_session_*` cookie plus the SDK's
 * `cookieFallback` entry both round-trip through `storageState`).
 *
 * Deliberately NOT under `test-results/`: Playwright clears that directory
 * itself, and the saved session is the one artifact a re-run should be able
 * to reuse without paying Appwrite's login rate limit again.
 */
export const AUTH_STATE = '.auth/smoke.json';

/**
 * True when the context really carries an Appwrite session cookie.
 *
 * `storageState` writes exactly what the browser holds, so an empty file is
 * a silent failure: every spec would then bounce and log in for itself — and
 * N parallel logins are the rate limit this suite exists to avoid. Global
 * setup checks this instead of assuming its own `signIn` worked.
 */
export async function hasSession(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some((cookie) => cookie.name.startsWith('a_session_'));
}

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

/** Fills the login form and waits for the app shell. Used only when the
 * saved session is missing or expired (see `signIn`). Exported so global
 * setup can force a login when its own bounce window was missed. */
export async function submitLogin(page: Page, base = ''): Promise<void> {
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(/\/dashboard\/?$/, { waitUntil: 'domcontentloaded' });
  } catch {
    // Surface WHY the form refused — a rate limit, a Turnstile failure and a
    // bad password all look identical from a bare waitForURL timeout.
    const notice = await page
      .locator('[role="alert"]')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Login did not reach /dashboard (stuck on ${page.url()})` +
        (notice?.trim() ? ` — the page said: "${notice.trim()}"` : ''),
    );
  }
}

/**
 * Ensures the page is authenticated, as cheaply as possible.
 *
 * Global setup signs in ONCE per run and saves the storage state; specs load
 * it via `test.use({ storageState: AUTH_STATE })`. Repeating the real login
 * per spec (what this used to do) hammers Appwrite's login rate limit — 21
 * parallel sign-ins tripped a 429 window that failed the whole suite. So:
 * open the dashboard, let AuthGate bounce a stale session to `/login`, and
 * only pay for a real login when that actually happens.
 *
 * `zz-prod` calls this with the production base: the localhost state does not
 * apply there, so it always takes the real-login path — which is what a prod
 * smoke test should do anyway.
 */
export async function signIn(page: Page, base = ''): Promise<void> {
  await stubTurnstile(page);
  await page.goto(`${base}/dashboard`, { waitUntil: 'load' });

  // AuthGate replaces the URL with `/login?next=…` once its session query
  // returns null. If no bounce arrives within the window, the saved session
  // is still good and we are done.
  const bounced = await page
    .waitForURL(/\/login/, { timeout: 6_000 })
    .then(() => true)
    .catch(() => false);

  // Two ways the window alone can lie: a cold dev server makes the redirect
  // land after it, and a silent bounce still leaves the URL on /login. The
  // URL is checked again, and — for the localhost suite only — so is the
  // session cookie, which is what the whole "one login per run" design rests
  // on. `zz-prod` keeps the old behaviour: the localhost state does not apply
  // on the production origin, so it always logs in for real.
  if (bounced || /\/login/.test(page.url())) {
    await submitLogin(page, base);
    return;
  }
  if (base === '' && !(await hasSession(page.context()))) await submitLogin(page, base);
}
