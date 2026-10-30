import { Account, Client, TablesDB, Teams } from 'appwrite';
import { APPWRITE } from './config';

/**
 * Lazily constructed, module-level Appwrite services. The whole app is a
 * static site, so every call happens in the browser after hydration.
 */

let client: Client | null = null;

function ensureClient(): Client {
  if (client) return client;
  if (typeof window === 'undefined') {
    throw new Error('Appwrite client accessed outside the browser.');
  }
  client = new Client().setEndpoint(APPWRITE.endpoint).setProject(APPWRITE.projectId);
  return client;
}

let account: Account | null = null;
let tables: TablesDB | null = null;
let teams: Teams | null = null;

export function getAccount(): Account {
  account ??= new Account(ensureClient());
  return account;
}

export function getTables(): TablesDB {
  tables ??= new TablesDB(ensureClient());
  return tables;
}

export function getTeams(): Teams {
  teams ??= new Teams(ensureClient());
  return teams;
}

/**
 * Short-lived session token for the first-party `/api/*` Functions. Appwrite
 * expires it in ~15 min, so it is minted per session, never stored — the
 * Functions verify it with `GET /account` and never see a long-lived secret.
 *
 * **Cached, single-flight.** This used to mint a fresh JWT on every call, and
 * Appwrite rate-limits `POST /account/jwts`: enough parallel requests tripped
 * HTTP 429, every `/api/*` call failed, and the org gate painted
 * "Organisasi gagal dimuat" on a perfectly healthy account. One token now
 * serves every call until it is within `REFRESH_MARGIN_MS` of expiry, and
 * concurrent callers share a single mint instead of racing to spend the
 * quota. The value lives only in this module's memory: nothing is written to
 * cookies or storage, and `clearMintedJwt()` drops it on sign-in/sign-out so
 * a token can never outlive the session it was minted for.
 */
const REFRESH_MARGIN_MS = 30_000;
/** Fallback lifetime when the token's own `exp` cannot be read. */
const JWT_FALLBACK_TTL_MS = 14 * 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;
/**
 * Bumped on sign-in/sign-out. A mint started before the bump belongs to an
 * account the app has already moved on from, so it is not cached.
 */
let epoch = 0;

/** Reads the token's own `exp` claim; `null` when it is unreadable. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function mintJwt(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) return cached.token;
  // Concurrent callers (a page firing its several queries at once) wait on
  // the one mint already in the air rather than spending the quota again.
  if (inFlight) return inFlight;

  const seen = epoch;
  const promise: Promise<string> = getAccount()
    .createJWT()
    .then(({ jwt }) => {
      if (seen === epoch) {
        cached = {
          token: jwt,
          expiresAt: tokenExpiry(jwt) ?? now + JWT_FALLBACK_TTL_MS,
        };
      }
      return jwt;
    })
    .finally(() => {
      // Only retire our own request: a sign-out may already have started a
      // newer one, and clearing that would leak a mint nobody owns.
      if (inFlight === promise) inFlight = null;
    });
  inFlight = promise;
  return inFlight;
}

/** Drops the cached token — called whenever the account changes. */
export function clearMintedJwt(): void {
  epoch += 1;
  cached = null;
  inFlight = null;
}
