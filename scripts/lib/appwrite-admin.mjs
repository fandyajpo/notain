/**
 * The one Appwrite admin client every script in `scripts/` shares.
 *
 * Why this module exists: each provisioning and migration script used to carry
 * its own copy of the config read, the API-key guard, the HTTP helper with its
 * 429 back-off, and the cursor loop — nineteen copies that had already drifted
 * apart. Three of them waited `retry-after` SECONDS as if it were milliseconds
 * (a 2 s back-off became 2 ms), and three passed `cursorAfter` as a plain URL
 * parameter, which Appwrite ignores because cursor paging is a *query*: those
 * scripts re-read page one forever on a collection big enough to fill a page.
 * One implementation cannot drift from itself.
 *
 * `scripts/` is tooling — nothing under `src/` or `functions/` imports this and
 * it is never bundled. The query dialect mirrors `functions/_lib/appwrite.ts`
 * (numbered `queries[i]` keys) so the tooling and the deployed Functions speak
 * the same language.
 */

export const endpoint = (
  process.env.PUBLIC_APPWRITE_ENDPOINT ?? 'https://sgp.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
export const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID ?? '6aca66fb003071c0ef43';
export const databaseId = process.env.PUBLIC_APPWRITE_DATABASE_ID ?? 'notain_db';
export const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();

/** Arguments after `--`. Scripts are dry-run unless `--yes` is present. */
export const argv = process.argv.slice(2);
export const confirmed = argv.includes('--yes');

export function hasFlag(name) {
  return argv.includes(`--${name}`);
}

export function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/**
 * Refuses to run without a key, and names the scopes this script needs — the
 * most common failure is a key created with only some of them, which Appwrite
 * answers with a 401 on the first write rather than at startup.
 */
export function requireApiKey(scopes = ['collections.read', 'collections.write']) {
  if (apiKey) return;
  fail(
    'APPWRITE_API_KEY belum diisi.\n' +
      '  1. Appwrite Console → project ini → Settings → API keys → Create\n' +
      `  2. Centang scope: ${scopes.join(', ')}\n` +
      '  3. Tambahkan ke .env: APPWRITE_API_KEY=key_...',
  );
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A non-2xx answer from Appwrite, carrying its status so callers can branch. */
export class AppwriteError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AppwriteError';
    this.status = status;
  }
}

const RATE_LIMIT_ATTEMPTS = 6;
const RATE_LIMIT_BASE_MS = 2000;

/**
 * One request against the Appwrite REST API with the admin key.
 *
 * A 429 is retried with the server's own `retry-after` (seconds, hence the
 * ×1000) and a bounded attempt count; anything else non-2xx throws so a caller
 * can decide whether it is fatal.
 */
export async function api(method, path, body) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      // A GET carries no payload: Appwrite reads path + query only, and a body
      // on GET is refused by some runtimes.
      ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 429 && attempt < RATE_LIMIT_ATTEMPTS) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : RATE_LIMIT_BASE_MS * attempt;
      console.log(`  rate-limited, tunggu ${Math.round(waitMs / 1000)}s…`);
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const text = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
      throw new AppwriteError(`${method} ${path} → ${response.status} ${text}`, response.status);
    }
    if (response.status === 204) return null;
    return response.json();
  }
}

/** `api` without the throw: `{ ok, status, body }`, for "may not exist" reads. */
export async function apiSafe(method, path, body) {
  try {
    return { ok: true, status: 200, body: await api(method, path, body) };
  } catch (error) {
    const status = error instanceof AppwriteError ? error.status : 0;
    return { ok: false, status, body: null, message: String(error?.message ?? error) };
  }
}

/** Appwrite reports `columns` on newer projects and `attributes` on older ones. */
export function fieldsOf(collection) {
  return collection?.columns ?? collection?.attributes ?? [];
}

/** Same set of permission strings, order-insensitive. */
export function samePermissions(current, expected) {
  const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const a = [...(current ?? [])].sort(byCodepoint);
  const b = [...expected].sort(byCodepoint);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function collectionPath(tableId) {
  return `/databases/${databaseId}/collections/${encodeURIComponent(tableId)}`;
}

export function documentPath(tableId, rowId) {
  return `${collectionPath(tableId)}/documents/${encodeURIComponent(rowId)}`;
}

/**
 * `queries[0]=…&queries[1]=…` — the only form Appwrite honours.
 *
 * The legacy `limit(100)` string errors out, a bare `0=`/`1=` key is ignored
 * outright, and repeating `queries[0]` keeps only the last value (which is how
 * an owner filter once disappeared from the admin drill-down). `values` must be
 * the query's own flat value array; a nested array is a 400.
 */
export function querySearch(queries) {
  return queries
    .map(
      (query, index) =>
        `queries[${index}]=${encodeURIComponent(
          JSON.stringify({
            method: query.method,
            attribute: query.attribute ?? null,
            values: query.values,
          }),
        )}`,
    )
    .join('&');
}

/** One page of rows. Returns Appwrite's envelope (`documents`, `total`). */
export async function listRowsPage(tableId, queries) {
  return api('GET', `${collectionPath(tableId)}/documents?${querySearch(queries)}`);
}

export const PAGE_SIZE = 100;
const MAX_PAGES = 200;

/**
 * Every row of a collection, following `cursorAfter` — which must ride *inside*
 * the query list, not beside it: as a URL parameter Appwrite silently ignores
 * it and every page is page one.
 *
 * Throws at the page cap rather than returning a silently truncated list, so a
 * migration can never report success on data it never saw.
 */
export async function listAllRows(tableId, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {}) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page += 1) {
    const queries = [{ method: 'limit', values: [pageSize] }];
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });
    const envelope = await listRowsPage(tableId, queries);
    const batch = Array.isArray(envelope?.documents) ? envelope.documents : [];

    rows.push(...batch);
    const last = batch.at(-1);
    if (batch.length < pageSize || !last) return rows;
    cursor = last.$id;
  }

  throw new Error(`${tableId}: berhenti setelah ${maxPages} halaman — periksa paginasi.`);
}

/**
 * Patches only the keys present in `data`. The payload must ride under a
 * top-level `data` key — Appwrite answers `document_missing_payload` for a flat
 * body, which is how the org-identity backfill used to fail without saying so.
 */
export async function patchRow(tableId, rowId, data, permissions) {
  return api('PATCH', documentPath(tableId, rowId), {
    data,
    ...(permissions ? { permissions } : {}),
  });
}

/** Creates a row with an explicit id; `permissions: []` means server-only. */
export async function createRow(tableId, rowId, data, permissions = []) {
  return api('POST', `${collectionPath(tableId)}/documents`, {
    documentId: rowId,
    data,
    permissions,
  });
}
