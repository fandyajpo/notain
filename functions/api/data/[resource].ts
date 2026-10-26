import { apiError, json } from '../../_lib/http';
import { enforceLimit } from '../../_lib/quota';
import {
  createRow,
  deleteRow,
  getRow,
  listRowsPage,
  patchRow,
  type ListQuery,
} from '../../_lib/rows';
import { requireOrg } from '../../_lib/orgs';
import type { TableId } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET|POST|PATCH|DELETE /api/data/<resource>?orgId=…` — the ONLY write path
 * for tenant data: invoices, customers, catalog, templates, stats.
 *
 * ## Why this exists
 *
 * The multi-tenancy decision (docs/multi-tenancy.md): membership, not row
 * permissions, is the isolation boundary — so the browser must never talk to
 * these tables directly. Every request here passes `requireOrg` (session +
 * an ACTIVE membership row), and only then does the API key touch Appwrite.
 * `orgId` arrives as a *hint from the client but is verified by the gate and
 * stamped server-side; `ownerId` (createdBy) is stamped from the session.
 * Neither is ever taken from the request body — a forged value is dropped by
 * the sanitizer below.
 *
 * ## Query grammar (GET)
 *
 * Whitelisted per resource so a client cannot invent filters that bypass an
 * index or probe another shape of data:
 *   orgId=…            required, gate-verified
 *   limit=N            capped at the resource's max
 *   cursorAfter=$id    keyset pagination
 *   select=a,b,c       projection (system attrs ride along)
 *   eq_<field>=v       equality on a whitelisted field
 *   gte_<field>/lte_<field>  range (invoices' finance window)
 *   starts_<field>=v   prefix (year's invoice numbers)
 *   search=term        multi-field full-text `or` (≥3 chars, like upstream)
 *   orderAsc=/orderDesc=    sort on a whitelisted attribute
 *   count=1            answer with `total` over the matched set
 *
 * ## Write validation
 *
 * The domain schemas already ran client-side when the draft entered the form.
 * Here the sanitizer's job is narrower and honest: drop system/stamp columns,
 * reject exotic values, cap payload size — then Appwrite itself enforces the
 * real column schema (it rejects unknown columns and wrong types). Body-level
 * trust is never extended to orgId/ownerId/plan, which the gate and session
 * own.
 *
 * Row-in-tenant checks: GET/PATCH/DELETE re-read the row and require its
 * stored `orgId` to equal the gated org, so a member of org A cannot operate
 * on org B's row id while authenticated into A.
 */

type ResourceConfig = {
  table: TableId;
  maxLimit: number;
  defaultOrder: Array<'orderAsc' | 'orderDesc'>;
  /** `equal` filters the client may send as `eq_<field>=`. */
  equal: string[];
  /** Range-filterable attributes (`gte_<field>` / `lte_<field>`). */
  range: string[];
  /** Prefix-filterable attributes (`starts_<field>=`). */
  startsWith: string[];
  /** Full-text fields `search=` ORs across; empty = no search support. */
  search: string[];
  /** Attributes allowed in orderAsc/orderDesc params. */
  orderable: string[];
  /** Create with `$id = orgId` (one row per org). */
  fixedId?: boolean;
  /** Conflict copy for a duplicate create (invoice number, …). */
  conflictMessage: string;
};

const RESOURCES: Record<string, ResourceConfig> = {
  invoices: {
    table: 'invoices',
    maxLimit: 100,
    defaultOrder: ['orderDesc', 'orderDesc'],
    equal: ['status', 'templateId'],
    range: ['date'],
    startsWith: ['invoiceNumber'],
    search: ['invoiceNumber', 'customerName', 'items'],
    orderable: ['date', '$createdAt'],
    conflictMessage: 'Nomor invoice ini sudah dipakai. Gunakan nomor lain.',
  },
  customers: {
    table: 'customers',
    maxLimit: 100,
    defaultOrder: ['orderAsc', 'orderAsc'],
    equal: ['name'],
    range: [],
    startsWith: [],
    search: ['name'],
    orderable: ['name', '$createdAt'],
    conflictMessage: 'Nama pelanggan ini sudah ada.',
  },
  catalog: {
    table: 'catalog',
    maxLimit: 100,
    defaultOrder: ['orderAsc', 'orderAsc'],
    equal: ['name'],
    range: [],
    startsWith: [],
    search: ['name'],
    orderable: ['name', '$createdAt'],
    conflictMessage: 'Baris katalog ini sudah ada.',
  },
  templates: {
    table: 'templates',
    maxLimit: 50,
    // Sort by `name` ONLY: the `templates` schema has no `order` column
    // (the picker sorts client-side — see appwrite-template-repository), and
    // Appwrite answers 400 "Attribute not found in schema: order" for the
    // phantom attribute, which the handler maps to 503 — breaking every
    // template read including the dashboard stats recompute's count.
    defaultOrder: ['orderAsc'],
    equal: [],
    range: [],
    startsWith: [],
    search: ['name'],
    orderable: ['name', '$createdAt'],
    conflictMessage: 'Template ini sudah ada.',
  },
  stats: {
    table: 'stats',
    maxLimit: 5,
    defaultOrder: ['orderDesc'],
    equal: [],
    range: [],
    startsWith: [],
    search: [],
    orderable: ['$createdAt'],
    fixedId: true,
    conflictMessage: 'Baris statistik sudah ada.',
  },
};

/** Default sort attributes paired with `defaultOrder` (same index order). */
const DEFAULT_ORDER_ATTRIBUTES: Record<string, string[]> = {
  invoices: ['date', '$createdAt'],
  customers: ['name', '$createdAt'],
  catalog: ['name', '$createdAt'],
  templates: ['name'],
  stats: ['$createdAt'],
};

/**
 * Columns a body may never set: tenancy, createdBy, billing and system
 * attributes are written only by the code paths that own them.
 */
const FORBIDDEN_BODY_KEYS = new Set([
  'orgId',
  'ownerId',
  'plan',
  'planExpiresAt',
  '$id',
  '$createdAt',
  '$updatedAt',
  '$permissions',
]);

const MAX_BODY_JSON_BYTES = 512 * 1024;
const MAX_STRING_CHARS = 65_536;
const SEARCH_MIN_CHARS = 3;
const BULK_DELETE_MAX = 20;

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Keeps plain JSON the Appwrite schema can judge: scalars, arrays and plain
 * objects only, strings bounded, forbidden keys dropped (silently — the same
 * "whitelist wins" rule the profile Function uses).
 */
function sanitizeBody(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_BODY_KEYS.has(key)) continue;
    if (value === null || typeof value === 'undefined') continue;
    const type = typeof value;
    if (type === 'string') {
      if ((value as string).length > MAX_STRING_CHARS) return null;
      out[key] = value;
    } else if (type === 'number') {
      if (!Number.isFinite(value as number)) return null;
      out[key] = value;
    } else if (type === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value) || type === 'object') {
      out[key] = value;
    } else {
      return null; // function, symbol, bigint — nothing that should persist
    }
  }
  try {
    if (JSON.stringify(out).length > MAX_BODY_JSON_BYTES) return null;
  } catch {
    return null; // cycles / non-serialisable
  }
  return out;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const resource = typeof params.resource === 'string' ? params.resource : '';
  const config = RESOURCES[resource];
  if (!config) {
    return apiError(404, 'not_found', 'Resource tidak dikenal.');
  }

  const url = new URL(request.url);
  const gate = await requireOrg(request, env, url.searchParams.get('orgId'));
  if (!gate.ok) return gate.response;
  const { auth, orgId, session } = gate.access;

  // ── GET: list or single row ────────────────────────────────────────────
  if (request.method === 'GET') {
    const rowId = url.searchParams.get('rowId');
    if (rowId !== null) {
      if (!RESOURCE_ID.test(rowId)) {
        return apiError(400, 'validation', 'Row tidak valid.');
      }
      const row = await getRow(auth, config.table, rowId, env);
      if (!row || row.orgId !== orgId) {
        return apiError(404, 'not_found', 'Data tidak ditemukan.');
      }
      return json(200, { row });
    }

    const built = buildQueries(config, url.searchParams, orgId);
    if ('error' in built) return built.error;

    const page = await listRowsPage(auth, config.table, built.queries, env);
    if (page === null) {
      return apiError(503, 'unavailable', 'Data belum bisa dibaca. Coba lagi.');
    }
    const last = page.rows.at(-1);
    // `total` comes from Appwrite's own matched-set count (limit-independent),
    // so a `limit=1&count=1` read answers a "how many?" question without rows.
    return json(200, {
      rows: page.rows,
      total: page.total,
      nextCursor: page.rows.length === built.limit && last ? last.$id : null,
    });
  }

  // ── POST: create (also bulk-delete, via ?action=) ──────────────────────
  if (request.method === 'POST') {
    if (url.searchParams.get('action') === 'bulk-delete') {
      const limited = enforceLimit('data-write', session.userId, env);
      if (limited) return limited;
      let body: { ids?: unknown } | null;
      try {
        body = (await request.json()) as { ids?: unknown };
      } catch {
        body = null;
      }
      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string' && RESOURCE_ID.test(id))
        : [];
      if (ids.length === 0 || ids.length > BULK_DELETE_MAX) {
        return apiError(400, 'validation', `Pilih 1–${BULK_DELETE_MAX} data sekaligus.`);
      }
      let deleted = 0;
      for (const id of ids) {
        const row = await getRow(auth, config.table, id, env);
        if (!row || row.orgId !== orgId) continue; // foreign/missing ids are skipped, not errored
        if (await deleteRow(auth, config.table, id, env)) deleted += 1;
      }
      return json(200, { deleted, requested: ids.length });
    }

    const limited = enforceLimit('data-write', session.userId, env);
    if (limited) return limited;

    let body: { data?: unknown; rowId?: unknown } | null;
    try {
      body = (await request.json()) as { data?: unknown; rowId?: unknown };
    } catch {
      body = null;
    }
    if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

    const data = sanitizeBody(body.data);
    if (data === null || Object.keys(data).length === 0) {
      return apiError(400, 'validation', 'Data yang dikirim tidak valid.');
    }

    // Stamp tenancy from the gate + session; the body cannot set these.
    data.orgId = orgId;
    data.ownerId = session.userId;

    let rowId = 'unique()';
    if (config.fixedId) {
      rowId = orgId;
    } else if (typeof body.rowId === 'string') {
      if (!RESOURCE_ID.test(body.rowId)) {
        return apiError(400, 'validation', 'Row id tidak valid.');
      }
      rowId = body.rowId;
    }

    const created = await createRow(auth, config.table, rowId, data, []);
    if (!created) {
      // Distinguish "already exists" (the deterministic invoice id or the
      // unique (orgId, number) index said no) from an upstream failure.
      if (rowId !== 'unique()') {
        const existing = await getRow(auth, config.table, rowId, env);
        if (existing && existing.orgId === orgId) {
          return apiError(409, 'conflict', config.conflictMessage);
        }
      }
      return apiError(503, 'unavailable', 'Gagal menyimpan data. Coba lagi.');
    }
    return json(201, { row: created });
  }

  // ── PATCH: update one row ──────────────────────────────────────────────
  if (request.method === 'PATCH') {
    const limited = enforceLimit('data-write', session.userId, env);
    if (limited) return limited;

    const rowId = url.searchParams.get('rowId');
    if (!rowId || !RESOURCE_ID.test(rowId)) {
      return apiError(400, 'validation', 'Row tidak valid.');
    }
    let body: { data?: unknown } | null;
    try {
      body = (await request.json()) as { data?: unknown };
    } catch {
      body = null;
    }
    const data = body ? sanitizeBody(body.data) : null;
    if (data === null || Object.keys(data).length === 0) {
      return apiError(400, 'validation', 'Data yang dikirim tidak valid.');
    }

    const existing = await getRow(auth, config.table, rowId, env);
    if (!existing || existing.orgId !== orgId) {
      return apiError(404, 'not_found', 'Data tidak ditemukan.');
    }
    if (!(await patchRow(auth, config.table, rowId, data))) {
      return apiError(503, 'unavailable', 'Gagal menyimpan data. Coba lagi.');
    }
    const updated = await getRow(auth, config.table, rowId, env);
    if (!updated) return apiError(503, 'unavailable', 'Gagal membaca data hasil simpan.');
    return json(200, { row: updated });
  }

  // ── DELETE: one row ────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    const limited = enforceLimit('data-write', session.userId, env);
    if (limited) return limited;

    const rowId = url.searchParams.get('rowId');
    if (!rowId || !RESOURCE_ID.test(rowId)) {
      return apiError(400, 'validation', 'Row tidak valid.');
    }
    const existing = await getRow(auth, config.table, rowId, env);
    if (!existing) return json(200, { ok: true }); // already gone = desired state
    if (existing.orgId !== orgId) {
      return apiError(404, 'not_found', 'Data tidak ditemukan.');
    }
    if (!(await deleteRow(auth, config.table, rowId, env))) {
      return apiError(503, 'unavailable', 'Gagal menghapus data. Coba lagi.');
    }
    return json(200, { ok: true });
  }

  return apiError(405, 'method_not_allowed', 'Metode tidak didukung.', {
    allow: 'GET, POST, PATCH, DELETE',
  });
};

/** Whitelisted query-string → Appwrite queries. Returns `{ error }` on a bad param. */
function buildQueries(
  config: ResourceConfig,
  params: URLSearchParams,
  orgId: string,
): { queries: ListQuery[]; limit: number } | { error: Response } {
  const queries: ListQuery[] = [{ method: 'equal', attribute: 'orgId', values: [orgId] }];

  // Every list is org-scoped first; index-served orderings come next in the
  // exact shape the resource's indexes expect (equality leads, sort follows).
  for (const field of config.equal) {
    const value = params.get(`eq_${field}`);
    if (value !== null) {
      // `''` is a real bucket (the unset invoice-status filter), not absence.
      queries.push({ method: 'equal', attribute: field, values: [value] });
    }
  }
  for (const field of config.range) {
    const from = params.get(`gte_${field}`);
    const to = params.get(`lte_${field}`);
    if (from !== null)
      queries.push({ method: 'greaterThanEqual', attribute: field, values: [from] });
    if (to !== null) queries.push({ method: 'lessThanEqual', attribute: field, values: [to] });
  }
  for (const field of config.startsWith) {
    const value = params.get(`starts_${field}`);
    if (value !== null) queries.push({ method: 'startsWith', attribute: field, values: [value] });
  }

  const search = (params.get('search') ?? '').trim();
  if (search.length >= SEARCH_MIN_CHARS && config.search.length > 0) {
    const branches = config.search.map((attribute) => ({
      method: 'search',
      attribute,
      values: [search],
    }));
    queries.push(
      branches.length === 1
        ? branches[0]!
        : { method: 'or', values: branches as unknown as unknown[] },
    );
  }

  const orderParams: Array<{ method: 'orderAsc' | 'orderDesc'; attribute: string }> = [];
  for (const direction of ['orderAsc', 'orderDesc'] as const) {
    for (const attribute of params.getAll(direction)) {
      if (!config.orderable.includes(attribute)) {
        return { error: apiError(400, 'validation', 'Pengurutan tidak valid.') };
      }
      orderParams.push({ method: direction, attribute });
    }
  }
  if (orderParams.length === 0) {
    const attributes = DEFAULT_ORDER_ATTRIBUTES[resource0(config)] ?? [];
    config.defaultOrder.forEach((method, index) => {
      const attribute = attributes[index];
      if (attribute) queries.push({ method, attribute, values: [] });
    });
  } else {
    for (const order of orderParams) {
      queries.push({ method: order.method, attribute: order.attribute, values: [] });
    }
  }

  const rawLimit = Number(params.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), config.maxLimit)
      : config.maxLimit;
  queries.push({ method: 'limit', values: [limit] });

  const cursor = params.get('cursorAfter');
  if (cursor !== null && RESOURCE_ID.test(cursor)) {
    queries.push({ method: 'cursorAfter', values: [cursor] });
  }

  const select = (params.get('select') ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter((field) => /^[A-Za-z0-9_$]{1,64}$/.test(field));
  if (select.length > 0) queries.push({ method: 'select', values: select });

  return { queries, limit };
}

/** The resource key for default-order lookup (kept out of `ResourceConfig` churn). */
function resource0(config: ResourceConfig): string {
  return Object.keys(RESOURCES).find((key) => RESOURCES[key] === config) ?? '';
}
