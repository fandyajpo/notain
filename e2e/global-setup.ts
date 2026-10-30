import { Account, Client, ID } from 'appwrite';
import { chromium, type FullConfig, type Page } from '@playwright/test';
import { AUTH_STATE, hasSession, signIn, submitLogin } from './support';

/**
 * The repo deliberately ships WITHOUT @types/node — its strict app tsconfig
 * must not see Node globals (see `functions/_lib/types.ts`). Global setup,
 * however, genuinely runs in Node and needs exactly these two members.
 */
declare const process: {
  env: Record<string, string | undefined>;
  loadEnvFile(path?: string): void;
};

const SMOKE_EMAIL = 'notain-smoke-a@example.test';
const SMOKE_PASSWORD = 'NotainSmoke12345!';
const SMOKE_NAME = 'Notain Smoke A';

const APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const APPWRITE_PROJECT = '6aca66fb003071c0ef43';
const DATABASE_ID = 'notain_db';

/**
 * The account behind `signIn`, re-created when it is missing.
 *
 * The suite used to assume this account always exists — but a
 * `reset:dev -- --users` wipe deletes it, and every authenticated spec then
 * failed with `401 user_invalid_credentials`. This is the same
 * register-then-sign-in pattern the smoke suite's `ensureSignedIn` uses, so
 * the suite provisions what it needs instead of depending on invisible
 * console state.
 */
async function ensureSmokeAccount(): Promise<void> {
  const account = new Account(
    new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT),
  );

  try {
    await account.createEmailPasswordSession({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD });
    return; // account exists and the password is right
  } catch {
    // fall through and (re)create it
  }

  try {
    await account.create({
      userId: ID.unique(),
      email: SMOKE_EMAIL,
      password: SMOKE_PASSWORD,
      name: SMOKE_NAME,
    });
  } catch (error) {
    // `user_already_exists` means the account is there after all (a wrong
    // password would not reach create) — the browser login will tell us more.
    const type = (error as { type?: string }).type;
    if (type !== 'user_already_exists') throw error;
  }
}

/**
 * Grants the smoke account's organization the Pro plan.
 *
 * The dashboard's finance section, invoice links and other headline features
 * are plan-gated (`1e6a7e6`), and the specs that exercise them were written
 * for an account that had them — a freshly created account starts on Free and
 * those specs would only ever see the upgrade teaser. Runs through the
 * Appwrite admin REST API with the key from `.env`; if the key is absent the
 * step is skipped and the plan-gated specs fail with their own visible
 * assertion instead of an opaque provisioning error.
 */
async function ensureProPlan(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    return; // no .env in this environment
  }
  const key = process.env.APPWRITE_API_KEY?.trim();
  if (!key) return;

  const headers = {
    'X-Appwrite-Project': APPWRITE_PROJECT,
    'X-Appwrite-Key': key,
    'content-type': 'application/json',
  };
  // This Appwrite build takes `queries[]` as repeated params, each carrying a
  // JSON object `{ method, attribute, values }` (SDK 28-era grammar). The
  // legacy single `queries=` JSON array of `equal("attr",["v"])` strings is
  // rejected with "Queries must be an array" / "Syntax error".
  const q = (query: Record<string, unknown>): string =>
    `queries[]=${encodeURIComponent(JSON.stringify(query))}`;
  const get = async (
    path: string,
  ): Promise<{ documents?: Record<string, unknown>[]; users?: Record<string, unknown>[] }> => {
    const res = await fetch(`${APPWRITE_ENDPOINT}${path}`, { headers });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`GET ${path} → ${res.status} ${body}`);
    }
    return (await res.json()) as {
      documents?: Record<string, unknown>[];
      users?: Record<string, unknown>[];
    };
  };

  const users = await get(
    `/users?${q({ method: 'equal', attribute: 'email', values: [SMOKE_EMAIL] })}`,
  );
  const userId = users.users?.[0]?.$id;
  if (typeof userId !== 'string') return;

  const memberships = await get(
    `/databases/${DATABASE_ID}/collections/memberships/documents?${q({
      method: 'equal',
      attribute: 'userId',
      values: [userId],
    })}&${q({ method: 'equal', attribute: 'role', values: ['owner'] })}&${q({
      method: 'equal',
      attribute: 'status',
      values: ['active'],
    })}`,
  );
  const orgId = memberships.documents?.[0]?.orgId;
  if (typeof orgId !== 'string') return;

  const expiresAt = new Date(Date.now() + 400 * 86_400_000).toISOString();
  const patch = async (collection: string, id: string): Promise<void> => {
    const res = await fetch(
      `${APPWRITE_ENDPOINT}/databases/${DATABASE_ID}/collections/${collection}/documents/${id}`,
      {
        method: 'PATCH',
        headers,
        // Same shape payment-settle writes: an ISO date, comfortably in the
        // future so `active` stays true for the whole suite.
        body: JSON.stringify({ data: { plan: 'pro', planExpiresAt: expiresAt } }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `plan grant PATCH ${collection} → ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    }
  };

  // The plan lives here since multi-tenancy — payment-settle patches this row.
  await patch('organizations', orgId);
  // The profile row's own plan columns are vestigial, but `/api/profile` still
  // read them until this branch is deployed (the dev proxy targets production),
  // so the fixture writes both. Harmless afterwards: the Function projects the
  // organization's plan and ignores this copy.
  await patch('profiles', orgId).catch((error: unknown) => {
    // A missing profile row only means onboarding has not saved one yet — the
    // org grant above is the one entitlements read.
    if (!String(error).includes('404')) throw error;
  });
}

/**
 * Walks the two-step onboarding (personal name → business name) when it
 * appears — only a freshly created account ever sees it.
 *
 * The modal is deliberately non-dismissible: it owns the screen until the
 * profile is saved, so without this every authenticated spec would time out
 * behind it. Completion is persisted server-side (profile + organization),
 * which is why later runs skip straight through.
 */
async function completeOnboarding(page: Page): Promise<void> {
  const sawOnboarding = await page
    .getByPlaceholder('Fandy Ahmad')
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (sawOnboarding) {
    await page.getByPlaceholder('Fandy Ahmad').fill('Notain Smoke');
    await page.getByRole('button', { name: 'Lanjut' }).click();
    await page.getByPlaceholder('Bengkel Jaya').fill('Warung Uji Coba');
    // "Selesai" when an org exists, "Buat dan mulai" in zero-org create mode.
    await page.getByRole('button', { name: /Selesai|Buat dan mulai/ }).click();
    await page.getByPlaceholder('Bengkel Jaya').waitFor({ state: 'hidden', timeout: 20_000 });
  }

  // Whatever queued a tour — onboarding completion above, or a first visit on
  // an account that was already onboarded — dismiss it here so the saved
  // storage state carries the completion. The driver overlay eats every
  // pointer event, so a spec without its own closeTour (the sidebar one) times
  // out behind it while the page is perfectly healthy.
  try {
    await page.locator('.driver-popover').waitFor({ state: 'visible', timeout: 5_000 });
    await page.keyboard.press('Escape');
    await page.locator('.driver-popover').waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    /* no tour queued */
  }

  // Warm every route the suite visits. Under parallel workers the first hit
  // of each route pays Vite's on-demand compile, and specs timing out at
  // 20–30 s were losing that race rather than finding real defects. One
  // sequential pass moves that cost to a single place.
  const warmRoutes = [
    '/dashboard',
    '/invoices',
    '/invoice/new',
    '/invoice/tidak-ada-9f3c2b',
    '/invoice/print',
    '/customers',
    '/catalog',
    '/templates',
    '/templates/new',
    '/templates/tpl_yang_tidak_ada',
    '/billing',
    '/api-keys',
    '/settings',
    '/settings/organization',
    '/site',
    '/probes',
  ];
  for (const route of warmRoutes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  }

  // The warmed pass ends wherever the last route left the tab; come home and
  // sweep any tour that only queues once the dashboard has actually settled
  // (the dismissal flag lives in localStorage, so it has to be written before
  // `storageState` is snapshotted).
  await page.goto('/dashboard', { waitUntil: 'load' }).catch(() => undefined);
  try {
    await page.locator('.driver-popover').waitFor({ state: 'visible', timeout: 6_000 });
    await page.keyboard.press('Escape');
    await page.locator('.driver-popover').waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    /* no tour queued */
  }
}

/**
 * One sign-in for the whole suite.
 *
 * Authenticated specs read `AUTH_STATE` through `test.use({ storageState })`
 * instead of logging in individually: 21 per-run logins against real Appwrite
 * tripped its login rate limit (HTTP 429 → "Terlalu banyak percobaan") and
 * failed every authenticated spec at once. This runs exactly once per run,
 * against the same dev server the specs target.
 *
 * If the login still fails here, the run stops with the page's own error
 * message rather than 21 identical timeouts.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:4321';

  await ensureSmokeAccount();
  await ensureProPlan();

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await signIn(page);
      // `signIn` only logs in when its 6-second bounce window catches the
      // redirect. A cold dev server can eat that window, and the run would
      // then ship an EMPTY storage state — every spec would bounce and log in
      // for itself, which is exactly the parallel rate limit this setup
      // exists to avoid. Check the cookie that actually matters and log in
      // explicitly when it never landed.
      if (!(await hasSession(context))) await submitLogin(page);
      await completeOnboarding(page);
      await context.storageState({ path: AUTH_STATE });
      if (!(await hasSession(context))) {
        throw new Error('the saved storage state carries no Appwrite session cookie');
      }
    } finally {
      await context.close();
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `e2e global setup could not save a session for the smoke account.\n` +
        `If the message shows a rate limit ("Terlalu banyak percobaan"), wait out Appwrite's ` +
        `login window and re-run — one login per run is all this suite costs.\n` +
        `Original error: ${reason}`,
      { cause: error },
    );
  } finally {
    await browser.close();
  }
}
