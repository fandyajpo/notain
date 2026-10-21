import { vi } from 'vitest';

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
    account: options.account ?? { $id: 'user-1', email: 'budi@example.com' },
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
      const documents = fake.lists.get(table) ?? [];
      // `total` mirrors the page, not the collection: the fake never filters,
      // so a caller that wants fewer rows should seed fewer.
      return json(200, { documents, total: documents.length });
    }
    if (method === 'POST') {
      const payload = fake.calls.at(-1)?.body as {
        documentId: string;
        data: Record<string, unknown>;
      };
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
    const patch = (fake.calls.at(-1)?.body as { data: Record<string, unknown> }).data;
    Object.assign(row, patch);
    return json(200, row);
  }
  return json(400, { message: `unsupported: ${method}` });
}
