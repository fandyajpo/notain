import { vi } from 'vite-plus/test';

/**
 * A tiny in-memory stand-in for the Appwrite REST surface the payments
 * Functions touch: `verifySession`'s `/account` probe plus the `getRow` /
 * `patchRow` / document-create calls. One `fetch` stub routes by URL and
 * method, records every call, and answers from a mutable table map — so a
 * test can assert both what the handler wrote and in which order.
 */

export type Row = Record<string, unknown> & { $id: string };

export type RecordedCall = { method: string; url: string; body?: unknown };

export type AppwriteFake = {
  /** What `GET /account` answers for the bearer JWT; `null` = signed out. */
  account: { $id: string; email: string } | null;
  /** Rows keyed by `${table}/${id}`. */
  rows: Map<string, Row>;
  /** Documents returned by collection queries, keyed by table. */
  lists: Map<string, Row[]>;
  /** Every Appwrite request the handler made, in order. */
  calls: RecordedCall[];
  /** Memberships the caller has in the `admins` team; `0` = not an admin. */
  teamMemberships: number;
  /** Accounts that exist for `GET /users/<id>`; anything else answers 404. */
  users: Map<string, { $id: string; email: string }>;
  fetch: ReturnType<typeof vi.fn>;
};

export function appwriteFake(
  options: {
    account?: { $id: string; email: string } | null;
    /**
     * Called for URLs on any origin OTHER than the fake Appwrite endpoint
     * (DOKU's sandbox API, audit-log side channels, …), so a test can answer
     * those without a second fetch stub fighting the first.
     */
    passthrough?: (input: RequestInfo | URL, init: RequestInit) => Response | Promise<Response>;
    /** The Appwrite endpoint this fake owns; everything else is passthrough. */
    endpoint?: string;
    /** When set, Appwrite writes (POST/PATCH) whose URL contains this answer 403. */
    writeFailureFor?: string;
    /** Defaults to `1` — the caller is an admin unless a test says otherwise. */
    teamMemberships?: number;
    /** Accounts answering `GET /users/<id>`; defaults to one `user-1`. */
    users?: Record<string, { $id: string; email: string }>;
  } = {},
): AppwriteFake {
  const fake: AppwriteFake = {
    // Explicit `null` means signed out (the documented contract) — only an
    // *omitted* option falls back to the default account.
    account:
      options.account !== undefined
        ? options.account
        : { $id: 'user-1', email: 'budi@example.com' },
    rows: new Map(),
    lists: new Map(),
    calls: [],
    teamMemberships: options.teamMemberships ?? 1,
    users: new Map(
      Object.entries(options.users ?? { 'user-1': { $id: 'user-1', email: 'budi@example.com' } }),
    ),
    fetch: vi.fn(),
  };

  if (options.writeFailureFor) {
    const marker = options.writeFailureFor;
    fake.fetch.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      fake.calls.push({ method, url, body: init.body });
      if ((method === 'POST' || method === 'PATCH') && url.includes(marker)) {
        return json(403, { message: 'write forbidden' });
      }
      return route(fake, method, url);
    });
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  fake.fetch.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? safeJson(init.body) : undefined;
    fake.calls.push({ method, url, body });
    const endpoint = options.endpoint ?? 'https://appwrite.test/v1';
    if (!url.startsWith(endpoint) && options.passthrough) {
      return options.passthrough(input, init);
    }
    return route(fake, method, url);
  });

  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type ParsedQuery = { method: string; attribute?: string | null; values?: unknown[] };

/**
 * Reads `queries[i]={json}` params (the REST encoding `querySearchAll`
 * writes) back into structured filters.
 */
function parseQueries(url: URL): ParsedQuery[] {
  const parsed: ParsedQuery[] = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (!/^queries\[\d+\]$/.test(key)) continue;
    try {
      const value = JSON.parse(raw) as ParsedQuery;
      if (typeof value?.method === 'string') parsed.push(value);
    } catch {
      // Unparseable query → treated as absent, matching how a test would fail
      // loudly on the *next* mismatch rather than here.
    }
  }
  return parsed;
}

function rowValue(row: Record<string, unknown>, attribute: string): unknown {
  if (attribute === '$id') return row.$id;
  return row[attribute];
}

/** One filter primitive — shared by the flat list and nested `or` branches. */
function matchesFilter(row: Row, query: ParsedQuery): boolean {
  const attribute = query.attribute ?? '';
  const values = query.values ?? [];
  switch (query.method) {
    case 'equal':
      return values.includes(rowValue(row, attribute));
    case 'notEqual':
      return !values.includes(rowValue(row, attribute));
    case 'isNull':
      return rowValue(row, attribute) == null;
    case 'isNotNull':
      return rowValue(row, attribute) != null;
    case 'startsWith': {
      const prefix = String(values[0] ?? '');
      return String(rowValue(row, attribute) ?? '').startsWith(prefix);
    }
    case 'greaterThanEqual':
      return String(rowValue(row, attribute) ?? '') >= String(values[0] ?? '');
    case 'lessThanEqual':
      return String(rowValue(row, attribute) ?? '') <= String(values[0] ?? '');
    case 'search': {
      const needle = String(values[0] ?? '').toLowerCase();
      const field = rowValue(row, attribute);
      const haystack = Array.isArray(field) ? field.join(' ') : String(field ?? '');
      return haystack.toLowerCase().includes(needle);
    }
    case 'or':
      return (values as unknown as ParsedQuery[]).some((branch) => matchesFilter(row, branch));
    default:
      throw new Error(`appwrite-fake: unsupported query method "${query.method}"`);
  }
}

/**
 * Applies the query language this codebase actually uses: equal/notEqual/
 * isNull/isNotNull/search as filters, orderAsc/orderDesc (applied in order,
 * first clause dominating, stable), cursorAfter, limit and select. An
 * unsupported method THROWS — a silently-ignored filter would let a
 * cross-tenant test pass on data the real Appwrite would have excluded.
 *
 * `total` counts the matched set *before* pagination, which is what Appwrite
 * reports (and what `limit(1) + total` counting relies on).
 */
function applyQueries(url: URL, input: Row[]): { rows: Row[]; total: number } {
  const queries = parseQueries(url);
  let rows = [...input];

  for (const query of queries) {
    switch (query.method) {
      case 'equal':
      case 'notEqual':
      case 'isNull':
      case 'isNotNull':
      case 'startsWith':
      case 'greaterThanEqual':
      case 'lessThanEqual':
      case 'search':
      case 'or':
        rows = rows.filter((row) => matchesFilter(row, query));
        break;
      // Ordering/pagination/projection run after every filter has narrowed
      // the set — `total` above must be the filtered count, not the page.
      case 'orderAsc':
      case 'orderDesc':
      case 'cursorAfter':
      case 'cursorBefore':
      case 'limit':
      case 'select':
        break;
      default:
        throw new Error(`appwrite-fake: unsupported query method "${query.method}"`);
    }
  }

  const total = rows.length;

  // Orders in sequence, applied last-clause-first so the leading clause
  // dominates (Appwrite's multi-order semantics), stable on ties.
  const orders = queries.filter(
    (query) => query.method === 'orderAsc' || query.method === 'orderDesc',
  );
  for (const query of [...orders].reverse()) {
    const attribute = query.attribute ?? '';
    const direction = query.method === 'orderDesc' ? -1 : 1;
    rows = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const left = rowValue(a.row, attribute) ?? '';
        const right = rowValue(b.row, attribute) ?? '';
        if (left === right) return a.index - b.index;
        return (left < right ? -1 : 1) * direction;
      })
      .map(({ row }) => row);
  }

  for (const query of queries) {
    if (query.method === 'cursorAfter') {
      const id = String(query.values?.[0] ?? '');
      const at = rows.findIndex((row) => row.$id === id);
      if (at >= 0) rows = rows.slice(at + 1);
    } else if (query.method === 'cursorBefore') {
      const id = String(query.values?.[0] ?? '');
      const at = rows.findIndex((row) => row.$id === id);
      if (at >= 0) rows = rows.slice(0, at);
    } else if (query.method === 'limit') {
      rows = rows.slice(0, Number(query.values?.[0] ?? rows.length));
    }
  }

  const select = queries.find((query) => query.method === 'select');
  if (select) {
    const keep = new Set((select.values ?? []).map(String));
    keep.add('$id');
    // System attributes ride along with a projection, as they do upstream.
    keep.add('$createdAt');
    keep.add('$updatedAt');
    rows = rows.map((row) => {
      const projected: Row = { $id: row.$id };
      for (const [key, value] of Object.entries(row)) {
        if (keep.has(key)) projected[key] = value;
      }
      return projected;
    });
  }

  return { rows, total };
}

function route(fake: AppwriteFake, method: string, url: string): Response {
  const parsed = new URL(url);

  // `verifySession`'s JWT probe — the only unauthenticated Appwrite call.
  if (parsed.pathname.endsWith('/account')) {
    if (!fake.account) return json(401, { message: 'Invalid token', type: 'user_unauthorized' });
    return json(200, fake.account);
  }

  // `requireAdmin`'s team probe — `GET /teams/admins/memberships?…userId=…`.
  // The query filter is ignored; membership is the same for every caller here.
  if (parsed.pathname.includes('/teams/') && parsed.pathname.endsWith('/memberships')) {
    return json(200, { total: fake.teamMemberships });
  }

  // The admin user LIST — `GET /users?queries…`. Answers from the `users`
  // map with the fields the endpoint reads; pagination params are ignored
  // (one small account list is all any test drives through here).
  if (parsed.pathname.endsWith('/users') && method === 'GET') {
    const users = [...fake.users.values()].map((user) => ({
      name: '',
      $createdAt: '2026-01-01T00:00:00.000Z',
      status: true,
      ...user,
    }));
    return json(200, { users, total: users.length });
  }

  // The admin content API checks the *target* user exists before writing.
  const userMatch = /\/users\/([^/]+)$/.exec(parsed.pathname);
  if (userMatch) {
    const user = fake.users.get(userMatch[1]);
    return user
      ? json(200, user)
      : json(404, { message: 'User not found', type: 'user_not_found' });
  }

  // /databases/<db>/collections/<table>/documents/<id?>
  const match = /\/databases\/[^/]+\/collections\/([^/]+)\/documents(?:\/([^/?]+))?/.exec(
    parsed.pathname,
  );
  if (!match) return json(404, { message: `unrouted: ${method} ${url}` });
  const table = match[1];
  const id = match[2];

  if (id === undefined) {
    if (method === 'GET') {
      // ONE logical store, like real Appwrite: rows written by id (POST/PATCH/
      // DELETE) and rows seeded into `lists` both answer collection queries.
      // Before this merge a row created through the API was invisible to every
      // list query — which silently made membership gates untestable.
      const listed = fake.lists.get(table) ?? [];
      const seen = new Set(listed.map((row) => row.$id));
      const created = [...fake.rows.entries()]
        .filter(([key]) => key.startsWith(`${table}/`))
        .map(([, row]) => row)
        .filter((row) => !seen.has(row.$id));
      // Filters are honoured now (see `applyQueries`): `total` is the
      // matched set, `documents` the requested page of it.
      const { rows: documents, total } = applyQueries(parsed, [...listed, ...created]);
      return json(200, { documents, total });
    }
    if (method === 'POST') {
      const payload = fake.calls.at(-1)?.body as {
        documentId: string;
        data: Record<string, unknown>;
      };
      // Appwrite rejects a second document whose explicit id already exists
      // (`unique()` never collides). The invoice number claim depends on
      // exactly that behaviour, so the fake has to model it — otherwise a
      // test would see a silent overwrite where production sees a 409.
      if (payload.documentId !== 'unique()' && fake.rows.has(`${table}/${payload.documentId}`)) {
        return json(409, { message: 'Document already exists', type: 'document_already_exists' });
      }
      const row = { $id: payload.documentId, ...payload.data } as Row;
      fake.rows.set(`${table}/${payload.documentId}`, row);
      return json(201, row);
    }
    return json(400, { message: 'unsupported collection op' });
  }

  const key = `${table}/${id}`;
  if (method === 'GET') {
    const row = fake.rows.get(key);
    return row ? json(200, row) : json(404, { message: 'Document not found' });
  }
  if (method === 'PATCH') {
    const row = fake.rows.get(key);
    if (!row) return json(404, { message: 'Document not found' });
    const patch = (fake.calls.at(-1)!.body as { data: Record<string, unknown> }).data;
    Object.assign(row, patch);
    return json(200, row);
  }
  if (method === 'DELETE') {
    // Appwrite answers 204 for a delete that lands and 404 for a row that is
    // already gone — both of which `deleteRow` treats as "desired state".
    const existed = fake.rows.delete(key);
    return existed
      ? new Response(null, { status: 204 })
      : json(404, { message: 'Document not found' });
  }
  return json(400, { message: `unsupported: ${method}` });
}
