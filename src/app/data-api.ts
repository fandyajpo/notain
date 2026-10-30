import { mintJwt } from '../appwrite/client';
import { appErrorFromStatus } from './errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';

/**
 * The browser's half of `/api/data/<resource>` — the tenant-scoped CRUD the
 * whole app now goes through instead of the Appwrite SDK.
 *
 * One transport, four verbs. Every call:
 * - mints the session JWT exactly like the payment functions do (the server
 *   resolves *who* is calling from it — no user id is ever trusted from
 *   here),
 * - carries the active organization as a query hint the server re-verifies,
 * - maps failures through the shared status mapping, so a 404 during a stale
 *   navigation surfaces as `not_found` and a 429 as `rate_limited`.
 *
 * Row shapes stay the raw stored documents: the repositories keep doing their
 * own mapping (`src/appwrite/mappers`), so moving the transport server-side
 * changed *where* rows come from, not what a row looks like.
 */

export type DataResource = 'invoices' | 'customers' | 'catalog' | 'templates' | 'stats';

export type ListParams = {
  orgId: string;
  limit?: number;
  cursorAfter?: string;
  select?: string[];
  search?: string;
  /** Equality filters, e.g. `{ status: 'lunas' }` (`''` = the unset bucket). */
  eq?: Record<string, string | undefined>;
  gte?: Record<string, string>;
  lte?: Record<string, string>;
  startsWith?: Record<string, string>;
  orderAsc?: string[];
  orderDesc?: string[];
};

export type DataRow = Record<string, unknown> & { $id: string };

export type ListResult<T extends DataRow = DataRow> = {
  rows: T[];
  /** Appwrite's matched-set count, independent of `limit`. */
  total: number;
  nextCursor: string | null;
};

async function bearerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let jwt: string;
  try {
    jwt = await mintJwt();
  } catch (error) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.', {
      cause: error,
    });
  }
  try {
    // `Headers`, not a spread: `init.headers` may be a `Headers` instance or
    // a [name, value] list, and spreading either produces indices, not
    // headers. Set ours after, so the bearer survives whatever came in.
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${jwt}`);
    return await fetch(path, { ...init, headers });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return body;
}

function resourcePath(resource: DataResource, params: URLSearchParams): string {
  return `/api/data/${resource}?${params.toString()}`;
}

function listQuery(resource: DataResource, params: ListParams): URLSearchParams {
  const query = new URLSearchParams({ orgId: params.orgId });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursorAfter !== undefined) query.set('cursorAfter', params.cursorAfter);
  if (params.search !== undefined) query.set('search', params.search);
  if (params.select?.length) query.set('select', params.select.join(','));
  for (const [field, value] of Object.entries(params.eq ?? {})) {
    if (value !== undefined) query.set(`eq_${field}`, value);
  }
  for (const [field, value] of Object.entries(params.gte ?? {})) query.set(`gte_${field}`, value);
  for (const [field, value] of Object.entries(params.lte ?? {})) query.set(`lte_${field}`, value);
  for (const [field, value] of Object.entries(params.startsWith ?? {})) {
    query.set(`starts_${field}`, value);
  }
  for (const field of params.orderAsc ?? []) query.append('orderAsc', field);
  for (const field of params.orderDesc ?? []) query.append('orderDesc', field);
  void resource;
  return query;
}

/**
 * One page of rows (plus `total`) inside the active organization.
 *
 * `T` is the stored-row type the mapper expects (e.g. `InvoiceRow`): the
 * generic is the same unchecked-but-declared contract the SDK's `listRows<T>`
 * gave us — the mappers are the runtime check, and they parse every field
 * they read.
 */
export async function listData<T extends DataRow = DataRow>(
  resource: DataResource,
  params: ListParams,
): Promise<ListResult<T>> {
  const response = await bearerFetch(resourcePath(resource, listQuery(resource, params)));
  if (!response.ok) throw appErrorFromStatus(response.status, await serverMessage(response));
  const body = await readJson(response);
  const rows = Array.isArray(body.rows) ? (body.rows as T[]) : [];
  return {
    rows,
    total: typeof body.total === 'number' ? body.total : rows.length,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
  };
}

/** One row by id, or `null` when it does not exist (or is not ours). */
export async function getRowData<T extends DataRow = DataRow>(
  resource: DataResource,
  orgId: string,
  rowId: string,
): Promise<T | null> {
  const query = new URLSearchParams({ orgId, rowId });
  const response = await bearerFetch(resourcePath(resource, query));
  if (response.status === 404) return null;
  if (!response.ok) throw appErrorFromStatus(response.status, await serverMessage(response));
  const body = await readJson(response);
  return (body.row as T | undefined) ?? null;
}

/**
 * Creates a row. `rowId` is the caller's deterministic id (the invoice
 * number's id, or the org id for the stats row); omit it for a random one.
 * A 409 arrives as the standard conflict error — the copy names what collided.
 */
export async function createData<T extends DataRow = DataRow>(
  resource: DataResource,
  orgId: string,
  data: Record<string, unknown>,
  rowId?: string,
): Promise<T> {
  const response = await bearerFetch(resourcePath(resource, new URLSearchParams({ orgId })), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, ...(rowId ? { rowId } : {}) }),
  });
  if (!response.ok) throw appErrorFromStatus(response.status, await serverMessage(response));
  const body = await readJson(response);
  const row = body.row as T | undefined;
  if (!row) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return row;
}

/** Patches the given columns of one row and returns the stored result. */
export async function patchData<T extends DataRow = DataRow>(
  resource: DataResource,
  orgId: string,
  rowId: string,
  data: Record<string, unknown>,
): Promise<T> {
  const query = new URLSearchParams({ orgId, rowId });
  const response = await bearerFetch(resourcePath(resource, query), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) throw appErrorFromStatus(response.status, await serverMessage(response));
  const body = await readJson(response);
  const row = body.row as T | undefined;
  if (!row) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return row;
}

/** Deletes one row; a 404 counts as success (already gone is the goal). */
export async function deleteData(
  resource: DataResource,
  orgId: string,
  rowId: string,
): Promise<void> {
  const query = new URLSearchParams({ orgId, rowId });
  const response = await bearerFetch(resourcePath(resource, query), { method: 'DELETE' });
  if (response.ok || response.status === 404) return;
  throw appErrorFromStatus(response.status, await serverMessage(response));
}

/**
 * Deletes many rows in one call (server budget: 20 per request — a larger
 * selection is simply issued again by {@link bulkDeleteAll} until done).
 * Foreign and missing ids are skipped server-side, never errored.
 */
export async function bulkDeleteData(
  resource: DataResource,
  orgId: string,
  ids: string[],
): Promise<{ deleted: number }> {
  const query = new URLSearchParams({ orgId, action: 'bulk-delete' });
  const response = await bearerFetch(resourcePath(resource, query), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw appErrorFromStatus(response.status, await serverMessage(response));
  const body = await readJson(response);
  return { deleted: typeof body.deleted === 'number' ? body.deleted : 0 };
}

/** Runs a bulk delete to completion in server-sized batches. */
export async function bulkDeleteAll(
  resource: DataResource,
  orgId: string,
  ids: string[],
): Promise<{ deleted: number }> {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    const result = await bulkDeleteData(resource, orgId, batch);
    deleted += result.deleted;
  }
  return { deleted };
}
