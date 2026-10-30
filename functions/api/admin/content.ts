import { z } from 'zod';
import { writeAudit } from '../../_lib/audit';
import { requireAdmin } from '../../_lib/admin';
import { querySearchAll } from '../../_lib/appwrite';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import { cacheDelete, cacheGet, cacheSet, count, quotaPolicy } from '../../_lib/quota';
import { getRow, patchRow, type TableId } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';
import {
  draftToRowData,
  draftToRowUpdateData,
  invoiceRowToDomain,
  templateRowToDomain,
  templateToRowData,
  type InvoiceRow,
  type TemplateRow,
} from '../../../src/appwrite/mappers';
import {
  INVOICE_STATUSES,
  type InvoiceDraft,
  type InvoiceStatus,
} from '../../../src/core/invoice/model';
import { canChangeStatus, statusFlowMessage } from '../../../src/core/invoice/status';
import { invoiceDraftSchema } from '../../../src/core/invoice/schema';
import { invoiceDocumentId, nextInvoiceNumber } from '../../../src/core/invoice/numbering';
import { invoiceContentFingerprint } from '../../../src/core/invoice/fingerprint';
import { invoiceTemplateSchema } from '../../../src/core/template/schema';
import { BUILTIN_TEMPLATE_IDS, getBuiltinTemplate } from '../../../src/core/template/builtins';
import { text } from '../../../src/core/shared/text';

const DATABASE_ID = 'notain_db';
const LIST_DEFAULT_LIMIT = 10;
const LIST_MAX_LIMIT = 50;

/** The two resources an admin may manage here — one implementation each. */
const RESOURCES = ['templates', 'invoices'] as const;
type Resource = (typeof RESOURCES)[number];
type Action = 'create' | 'update' | 'delete';

const TABLE_OF: Record<Resource, TableId> = {
  templates: 'templates',
  invoices: 'invoices',
};

const TARGET_TYPE: Record<Resource, string> = {
  templates: 'template',
  invoices: 'invoice',
};

function parseResource(value: string | null): Resource | null {
  return (RESOURCES as readonly string[]).includes(value ?? '') ? (value as Resource) : null;
}

/** A stored status column (`''` for unset) read back into the domain's type. */
function storedStatus(raw: unknown): InvoiceStatus | null {
  return typeof raw === 'string' && (INVOICE_STATUSES as readonly string[]).includes(raw)
    ? (raw as InvoiceStatus)
    : null;
}

/**
 * `GET /api/admin/content?userId=…&resource=…` — one page of a single user's
 * templates or invoices, already scoped to that owner, in the lean shape the
 * table renders.
 *
 * `GET …&rowId=…` — that one row's *full* content (layout and theme for a
 * template; items, sections, notes and adjustments for an invoice), fetched
 * only when an edit dialog opens so the list stays cheap.
 *
 * `POST /api/admin/content` — `{ userId, resource, action, … }` to create,
 * update or delete one of that user's rows.
 *
 * Every request crosses the same wall as the rest of the admin API:
 * `requireAdmin` verifies the JWT *and* membership in the `admins` team
 * server-side, so the caller's role never comes from the client. On top of
 * that each mutation re-reads the target row and refuses unless it is owned by
 * the `userId` in the request — an admin can only touch rows that belong to
 * the user they selected, and only a user that actually exists.
 *
 * Client payloads are validated with the same zod schemas the app's own forms
 * use, so an admin-created or admin-edited invoice cannot bypass a rule the
 * user's form enforces.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.');
  }

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;
  const { endpoint, headers, session } = gate.admin;
  const auth = { endpoint, headers };

  if (request.method === 'GET') {
    return read(auth, new URL(request.url), env);
  }
  return mutate(auth, request, env, session.userId, session.email);
};

// --- Read -------------------------------------------------------------------

/**
 * Columns the invoices list projects. The rich-text sections and the line
 * items are the bulk of a row and the table never shows them, so they stay
 * server-side until an edit dialog asks for one row by id. `$id` must be
 * named explicitly or Appwrite drops it from a projected read.
 */
const INVOICE_SELECT = [
  '$id',
  'ownerId',
  'invoiceNumber',
  'customerName',
  'customerPhone',
  'customerEmail',
  'status',
  'date',
  'dueDate',
];

async function read(
  auth: { endpoint: string; headers: Record<string, string> },
  url: URL,
  env: Env,
): Promise<Response> {
  const userId = url.searchParams.get('userId');
  if (!userId) return apiError(400, 'validation', 'userId wajib diisi.');

  const resource = parseResource(url.searchParams.get('resource'));
  if (!resource) return apiError(400, 'validation', 'resource harus templates atau invoices.');

  const rowId = url.searchParams.get('rowId');
  if (rowId) return readDetail(auth, userId, resource, rowId);

  if (url.searchParams.get('nextNumber') === '1' && resource === 'invoices') {
    return nextInvoiceNumberResponse(auth, userId, env);
  }

  return listContent(auth, url, userId, resource);
}

/**
 * `GET …&nextNumber=1` — the next free invoice number for this user, derived
 * from the numbers they already own. The create dialog reads it so an admin
 * never has to invent a sequence number and then collide with one.
 *
 * This is the single most expensive read in the admin API (one Appwrite read
 * per row of the owner's invoice history), so it is guarded three ways:
 *
 * 1. **Cache** — the suggestion for an owner+year is reused for a short TTL
 *    (default 30 s, `QUOTA_NEXT_NUMBER_CACHE_TTL_MS`) and invalidated
 *    eagerly on every invoice create in this isolate, so a create → dialog →
 *    create loop re-derives only when something actually changed.
 * 2. **Projection** — only `$id` + `invoiceNumber` are requested.
 * 3. **Bound** — the cursor scan stops after `QUOTA_NEXT_NUMBER_MAX_PAGES`
 *    pages (default 10 × 100 = 1 000 rows, the historical behaviour) and says
 *    `partial: true` instead of silently pretending a truncated scan is the
 *    real maximum; the client may then show a suggested number that turns out
 *    to be taken, and the create path's `invoiceNumberTaken` check still
 *    refuses the collision (correctness never depends on the cache or the
 *    bound — only the suggestion's freshness does).
 */
async function nextInvoiceNumberResponse(
  auth: { endpoint: string; headers: Record<string, string> },
  userId: string,
  env: Env,
): Promise<Response> {
  const policy = quotaPolicy(env);
  const year = new Date().getFullYear();
  const cacheKey = `next-number:${userId}:${year}`;
  const cached = cacheGet<string>(cacheKey);
  if (cached) {
    count('admin.next-number.cache-hit');
    return json(200, { invoiceNumber: cached, cached: true });
  }

  const maxPages = Math.max(
    1,
    Number.isFinite(Number(env.QUOTA_NEXT_NUMBER_MAX_PAGES))
      ? Math.floor(Number(env.QUOTA_NEXT_NUMBER_MAX_PAGES))
      : 10,
  );

  const numbers: string[] = [];
  let cursor: string | null = null;
  let partial = false;
  // `total` is independent of `limit`, so one cheap first-page meta-read
  // would not help: rows must still be scanned to find the max sequence.
  // A failed page ends the scan with what was gathered rather than failing
  // the request.
  for (let page = 0; page < maxPages; page += 1) {
    const queries: Array<{ method: string; values: unknown[]; attribute?: string | null }> = [
      { method: 'equal', attribute: 'ownerId', values: [userId] },
      { method: 'select', values: ['$id', 'invoiceNumber'] },
      { method: 'limit', values: [100] },
    ];
    if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });
    const response = await fetch(
      `${auth.endpoint}/databases/${DATABASE_ID}/collections/invoices/documents?${querySearchAll(queries)}`,
      { headers: auth.headers },
    );
    if (!response.ok) break;
    const data = (await response.json()) as {
      documents: Array<{ $id: string; invoiceNumber?: unknown }>;
    };
    for (const doc of data.documents) {
      if (typeof doc.invoiceNumber === 'string') numbers.push(doc.invoiceNumber);
    }
    if (data.documents.length < 100) break;
    cursor = data.documents[data.documents.length - 1]?.$id ?? null;
    if (!cursor) break;
    // Out of pages but the last page was full: there may be more rows, so
    // the max below is a lower bound — flag it rather than overstate it.
    if (page === maxPages - 1) partial = true;
  }

  const suggestion = nextInvoiceNumber(numbers);
  // A partial scan must not be pinned as truth: only cache complete answers.
  if (!partial) cacheSet(cacheKey, suggestion, policy.nextNumberCacheTtlMs);
  count('admin.next-number.derived');
  return partial
    ? json(200, { invoiceNumber: suggestion, partial: true })
    : json(200, { invoiceNumber: suggestion });
}

/** Drops a cached suggestion after a write that may have consumed the number. */
function invalidateNextNumber(ownerId: string): void {
  cacheDelete(`next-number:${ownerId}:${new Date().getFullYear()}`);
}

/**
 * The invoices collection has no unique index on `invoiceNumber`, so the rule
 * lives here: one user's numbers are theirs to sequence, and a second row with
 * the same number would make every "open invoice INV-…" support question
 * ambiguous.
 */
async function invoiceNumberTaken(
  auth: { endpoint: string; headers: Record<string, string> },
  ownerId: string,
  invoiceNumber: string,
  exceptRowId?: string,
): Promise<boolean> {
  const queries = [
    { method: 'equal', attribute: 'ownerId', values: [ownerId] },
    { method: 'equal', attribute: 'invoiceNumber', values: [invoiceNumber] },
    { method: 'select', values: ['$id'] },
    { method: 'limit', values: [2] },
  ];
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/invoices/documents?${querySearchAll(queries)}`,
    { headers: auth.headers },
  );
  if (!response.ok) return false;
  const data = (await response.json()) as { documents: Array<{ $id: string }> };
  return data.documents.some((doc) => doc.$id !== exceptRowId);
}

/**
 * One row's full content for the edit dialog.
 *
 * Same ownership boundary as a write: the row is re-read and must belong to
 * the selected user, so a hand-crafted `rowId` cannot read someone else's
 * data.
 */
async function readDetail(
  auth: { endpoint: string; headers: Record<string, string> },
  userId: string,
  resource: Resource,
  rowId: string,
): Promise<Response> {
  const row = await getRow(auth, TABLE_OF[resource], rowId);
  if (!row || typeof row.ownerId !== 'string' || row.ownerId !== userId) {
    return apiError(404, 'not_found', 'Data tidak ditemukan atau bukan milik user ini.');
  }

  if (resource === 'templates') {
    const template = templateRowToDomain(row as TemplateRow);
    return json(200, {
      id: template.id,
      ownerId: row.ownerId,
      name: template.name,
      businessType: template.businessType,
      layout: template.layout,
      theme: template.theme,
      defaults: template.defaults,
      createdAt: row.$createdAt ?? '',
      updatedAt: row.$updatedAt ?? '',
    });
  }

  const invoice = invoiceRowToDomain(row as InvoiceRow);
  // Optional columns travel as `undefined` so `JSON.stringify` drops them:
  // the client's draft type is `dueDate?: string`, not `dueDate: string|null`,
  // and a `null` here would poison every field of the same shape.
  return json(200, {
    id: invoice.id,
    ownerId: invoice.ownerId,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    dueDate: invoice.dueDate,
    templateId: invoice.templateId,
    status: invoice.status,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    customerEmail: invoice.customerEmail,
    items: invoice.items,
    details: invoice.details,
    discount: invoice.discount,
    tax: invoice.tax,
    sections: invoice.sections,
    notes: invoice.notes,
  });
}

async function listContent(
  auth: { endpoint: string; headers: Record<string, string> },
  url: URL,
  userId: string,
  resource: Resource,
): Promise<Response> {
  const limitParam = Number(url.searchParams.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), LIST_MAX_LIMIT)
      : LIST_DEFAULT_LIMIT;
  const cursor = url.searchParams.get('cursorAfter');

  // The owner filter is the authorization boundary for a read: no request can
  // list rows that are not this user's.
  const queries: Array<{ method: string; values: unknown[]; attribute?: string | null }> = [
    { method: 'equal', attribute: 'ownerId', values: [userId] },
    { method: 'limit', values: [limit] },
  ];
  if (resource === 'invoices') queries.push({ method: 'select', values: INVOICE_SELECT });
  if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${TABLE_OF[resource]}/documents?${querySearchAll(queries)}`,
    { headers: auth.headers },
  );
  if (!response.ok) {
    return apiError(500, 'validation', `Gagal mengambil ${resource}.`);
  }
  const data = (await response.json()) as {
    documents: Array<Record<string, unknown> & { $id: string }>;
    total: number;
  };

  const rows = data.documents.map((doc) =>
    resource === 'templates'
      ? {
          id: doc.$id,
          ownerId: text(doc.ownerId ?? userId),
          name: text(doc.name ?? ''),
          businessType: typeof doc.businessType === 'string' ? doc.businessType : null,
          createdAt: text(doc.$createdAt),
          updatedAt: text(doc.$updatedAt),
        }
      : {
          id: doc.$id,
          ownerId: text(doc.ownerId ?? userId),
          invoiceNumber: text(doc.invoiceNumber),
          customerName: text(doc.customerName),
          customerPhone: typeof doc.customerPhone === 'string' ? doc.customerPhone : '',
          customerEmail: typeof doc.customerEmail === 'string' ? doc.customerEmail : '',
          date: text(doc.date),
          dueDate: typeof doc.dueDate === 'string' ? doc.dueDate : '',
          // Stored as '' for "Belum dikirim" — normalise once, here, so the
          // screen never has to know the column's empty-state encoding.
          status: (INVOICE_STATUSES as readonly string[]).includes(String(doc.status))
            ? String(doc.status)
            : null,
        },
  );

  return json(200, {
    rows,
    total: data.total,
    nextCursor:
      rows.length === limit && rows.length > 0 ? (rows[rows.length - 1]?.id ?? null) : null,
  });
}

// --- Write ------------------------------------------------------------------

type Body = {
  userId: string;
  resource: Resource;
  action: Action;
  rowId?: string;
  /**
   * Templates, both actions:
   * - `create` — `{ name, base }`, the built-in the new row is copied from.
   * - `update` — a complete authored template (name, layout, theme, defaults,
   *   businessType): the whole design travels, so the write is validated and
   *   stored exactly like a save in the owner's own editor.
   */
  template?: unknown;
  /**
   * Invoices, both actions: a full draft, exactly what the builder submits.
   * On `update` it is written through `draftToRowUpdateData`, which drops the
   * `status` column so a content save is structurally unable to touch the
   * lifecycle.
   */
  draft?: unknown;
  /** Invoices, `update` only: a status change, checked against the stored one. */
  status?: InvoiceStatus | null;
  /**
   * Invoices, `update` only: the content fingerprint the dialog loaded the row
   * with. A mismatch means the owner (or another tab) edited the content in
   * between, and the write is refused rather than clobbering their save.
   * Absent means "no baseline" — the builder never sends one.
   */
  expectedContentHash?: string;
  /**
   * Templates, `update` only: the `updatedAt` the dialog read the row with.
   * A mismatch means someone else saved in the meantime and the write is
   * refused rather than allowed to clobber their save.
   */
  expectedUpdatedAt?: string;
};

const templateCreateSchema = z.object({
  name: z.string().trim().min(1, 'Masukkan nama template.').max(100, 'Nama terlalu panjang.'),
  base: z.enum(BUILTIN_TEMPLATE_IDS),
});

const invoiceStatusSchema = z.enum(INVOICE_STATUSES).nullable();

async function mutate(
  auth: { endpoint: string; headers: Record<string, string> },
  request: Request,
  env: Env,
  actorId: string,
  actorEmail: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== 'object') {
    return apiError(400, 'validation', 'Payload tidak valid.');
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  const resource = parseResource(body.resource ?? null);
  const action = body.action;
  if (!userId) return apiError(400, 'validation', 'userId wajib diisi.');
  if (!resource) return apiError(400, 'validation', 'resource harus templates atau invoices.');
  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    return apiError(400, 'validation', 'action harus create, update, atau delete.');
  }

  // The target has to be a real account before anything is written for it —
  // otherwise a typo'd id would silently create an orphaned row.
  const target = await fetch(`${auth.endpoint}/users/${encodeURIComponent(userId)}`, {
    headers: auth.headers,
  });
  if (target.status === 404) return apiError(404, 'not_found', 'User tidak ditemukan.');
  if (!target.ok) return apiError(500, 'validation', 'Gagal memverifikasi user.');

  const rowId = typeof body.rowId === 'string' ? body.rowId : '';

  if (action === 'create') {
    if (resource === 'templates')
      return createTemplate(auth, env, body, userId, { actorId, actorEmail });
    return createInvoice(auth, env, body, userId, { actorId, actorEmail });
  }

  if (!rowId) return apiError(400, 'validation', 'rowId wajib diisi.');

  // Ownership is re-checked here rather than inferred from the list query: the
  // client picks `rowId`, and the only authority for "this row belongs to the
  // selected user" is the row itself.
  const row = await getRow(auth, TABLE_OF[resource], rowId);
  if (!row || typeof row.ownerId !== 'string' || row.ownerId !== userId) {
    return apiError(404, 'not_found', 'Data tidak ditemukan atau bukan milik user ini.');
  }

  if (action === 'delete') {
    const response = await fetch(
      `${auth.endpoint}/databases/${DATABASE_ID}/collections/${TABLE_OF[resource]}/documents/${encodeURIComponent(rowId)}`,
      { method: 'DELETE', headers: auth.headers },
    );
    if (response.status === 404) return apiError(404, 'not_found', 'Data tidak ditemukan.');
    if (!response.ok) return apiError(500, 'validation', 'Gagal menghapus data.');
    await writeAudit(env, {
      actorId,
      actorEmail,
      action: `content.${resource}.delete`,
      targetType: TARGET_TYPE[resource],
      targetId: rowId,
      detail: JSON.stringify({ userId }),
    });
    return json(200, { success: true });
  }

  if (resource === 'templates') {
    // Optimistic concurrency: the dialog read the design at `expectedUpdatedAt`,
    // and a row that has moved on since (the owner saving in their own editor,
    // a second admin tab) would have the two saves clobber each other. Any
    // other write path leaves the field off, so it is never asked to compare.
    const expected = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : '';
    if (
      expected &&
      typeof row.$updatedAt === 'string' &&
      row.$updatedAt &&
      expected !== row.$updatedAt
    ) {
      return apiError(409, 'conflict', 'Template ini diubah di tempat lain. Muat ulang halaman.');
    }
    // The whole design: name, blocks, colours and prose in one payload, so a
    // save here is the same write (and the same validation) as the owner
    // pressing "Simpan template" in their editor.
    const parsed = invoiceTemplateSchema.safeParse(body.template ?? {});
    if (!parsed.success) {
      return apiError(
        400,
        'validation',
        parsed.error.issues[0]?.message ?? 'Template tidak valid.',
      );
    }
    const ok = await patchRow(auth, 'templates', rowId, templateToRowData(parsed.data));
    if (!ok) return apiError(500, 'validation', 'Gagal memperbarui template.');
    await writeAudit(env, {
      actorId,
      actorEmail,
      action: 'content.templates.update',
      targetType: 'template',
      targetId: rowId,
      detail: JSON.stringify({
        userId,
        name: parsed.data.name,
        businessType: parsed.data.businessType,
      }),
    });
    return json(200, { success: true });
  }

  const draft = invoiceDraftSchema.safeParse(body.draft ?? {});
  if (!draft.success) {
    return apiError(
      400,
      'validation',
      draft.error.issues[0]?.message ?? 'Data invoice tidak valid.',
    );
  }

  // Optimistic concurrency on content: the dialog hashed the draft it loaded,
  // and a row whose content has moved on since (the owner's builder saving, a
  // second admin tab) would have the two saves clobber each other. Status and
  // payment-proof writes do not participate — they touch other columns, which
  // this write cannot touch either.
  const expectedHash = typeof body.expectedContentHash === 'string' ? body.expectedContentHash : '';
  if (expectedHash) {
    const currentHash = await invoiceContentFingerprint(invoiceRowToDomain(row as InvoiceRow));
    if (currentHash !== expectedHash) {
      return apiError(409, 'conflict', 'Invoice ini diubah di tempat lain. Muat ulang halaman.');
    }
  }

  // The number is only re-checked when it actually changes: a user's numbers
  // are their sequence, and a second row under the same number would make
  // every "open INV-…" question ambiguous.
  const nextNumber = draft.data.invoiceNumber;
  const currentNumber = typeof row.invoiceNumber === 'string' ? row.invoiceNumber : '';
  if (nextNumber !== currentNumber && (await invoiceNumberTaken(auth, userId, nextNumber, rowId))) {
    return apiError(409, 'conflict', 'Nomor invoice ini sudah dipakai. Gunakan nomor lain.');
  }

  // Content first: `draftToRowUpdateData` drops `status`, so this half can
  // never move the lifecycle on its own.
  const data: Record<string, unknown> = draftToRowUpdateData(draft.data as InvoiceDraft);

  // The lifecycle rule is the same one the builder's `StatusSelect` uses: a
  // forward-only chain with terminal end states, never a clear back to unset.
  // An admin is not exempt — this is what stops a support edit from rewinding
  // `Lunas` to `Terkirim`.
  if (body.status !== undefined) {
    const status = invoiceStatusSchema.safeParse(body.status);
    if (!status.success) return apiError(400, 'validation', 'Status invoice tidak valid.');
    const from = storedStatus(row.status);
    const to = status.data;
    if (!canChangeStatus(from, to)) {
      return apiError(409, 'conflict', statusFlowMessage(from, to));
    }
    data.status = to ?? '';
  }

  const ok = await patchRow(auth, 'invoices', rowId, data);
  if (!ok) return apiError(500, 'validation', 'Gagal memperbarui invoice.');
  await writeAudit(env, {
    actorId,
    actorEmail,
    action: 'content.invoices.update',
    targetType: 'invoice',
    targetId: rowId,
    detail: JSON.stringify({
      userId,
      invoiceNumber: draft.data.invoiceNumber,
      status: body.status === undefined ? undefined : (body.status ?? 'unset'),
    }),
  });
  return json(200, { success: true });
}

/**
 * A new template starts from one of the three built-ins rather than from
 * nothing: `invoiceTemplateSchema` requires the kop, item list and total
 * blocks, and a blank row would fail that rule — a copied built-in is both
 * valid and immediately usable by the owner.
 */
async function createTemplate(
  auth: { endpoint: string; headers: Record<string, string> },
  env: Env,
  body: Body,
  userId: string,
  actor: { actorId: string; actorEmail: string },
): Promise<Response> {
  const parsed = templateCreateSchema.safeParse(body.template ?? {});
  if (!parsed.success) {
    return apiError(
      400,
      'validation',
      parsed.error.issues[0]?.message ?? 'Data template tidak valid.',
    );
  }

  const base = getBuiltinTemplate(parsed.data.base);
  if (!base) return apiError(400, 'validation', 'Template dasar tidak ditemukan.');

  const authored = invoiceTemplateSchema.safeParse({
    name: parsed.data.name,
    layout: base.layout,
    theme: base.theme,
    defaults: base.defaults,
    businessType: base.businessType,
  });
  if (!authored.success) {
    return apiError(400, 'validation', 'Template dasar tidak valid.');
  }

  const created = await createDocument(auth, 'templates', userId, {
    ownerId: userId,
    ...templateToRowData(authored.data),
  });
  if (!created.ok) return created.response;

  await writeAudit(env, {
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    action: 'content.templates.create',
    targetType: 'template',
    targetId: created.rowId,
    detail: JSON.stringify({ userId, name: parsed.data.name, base: parsed.data.base }),
  });
  return json(201, { success: true, id: created.rowId });
}

async function createInvoice(
  auth: { endpoint: string; headers: Record<string, string> },
  env: Env,
  body: Body,
  userId: string,
  actor: { actorId: string; actorEmail: string },
): Promise<Response> {
  const parsed = invoiceDraftSchema.safeParse(body.draft ?? {});
  if (!parsed.success) {
    return apiError(
      400,
      'validation',
      parsed.error.issues[0]?.message ?? 'Data invoice tidak valid.',
    );
  }

  if (await invoiceNumberTaken(auth, userId, parsed.data.invoiceNumber)) {
    return apiError(409, 'conflict', 'Nomor invoice ini sudah dipakai. Gunakan nomor lain.');
  }

  const created = await createDocument(
    auth,
    'invoices',
    userId,
    {
      ownerId: userId,
      ...draftToRowData(parsed.data as InvoiceDraft),
    },
    // The same deterministic id the app's own create mints: even when two
    // admin dialogs race past the `invoiceNumberTaken` fast path, Appwrite
    // accepts exactly one of them and the loser gets a 409 instead of a
    // silent duplicate.
    await invoiceDocumentId(userId, parsed.data.invoiceNumber),
  );
  if (!created.ok) return created.response;

  // The number is consumed: drop any cached suggestion so the next dialog
  // opens on the one after it.
  invalidateNextNumber(userId);

  await writeAudit(env, {
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    action: 'content.invoices.create',
    targetType: 'invoice',
    targetId: created.rowId,
    detail: JSON.stringify({
      userId,
      invoiceNumber: parsed.data.invoiceNumber,
      customerName: parsed.data.customerName,
    }),
  });
  return json(201, { success: true, id: created.rowId });
}

/**
 * Writes one row as the target user.
 *
 * The permissions mirror `ownerRowPermissions` in `src/appwrite/permissions.ts`
 * — without them a row created with the API key would be readable by nobody
 * but the key, and the owner would never see it in their own app.
 */
async function createDocument(
  auth: { endpoint: string; headers: Record<string, string> },
  table: TableId,
  ownerId: string,
  data: Record<string, unknown>,
  /**
   * Explicit document id. Only the invoice create passes one (the
   * deterministic number claim); every other caller keeps `unique()`, which
   * can never collide — so a 409 from this endpoint always means "that
   * invoice number is already owned".
   */
  rowId?: string,
): Promise<{ ok: true; rowId: string } | { ok: false; response: Response }> {
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${table}/documents`,
    {
      method: 'POST',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: rowId ?? 'unique()',
        data,
        permissions: [
          `read("user:${ownerId}")`,
          `update("user:${ownerId}")`,
          `delete("user:${ownerId}")`,
        ],
      }),
    },
  );
  if (response.status === 409) {
    return {
      ok: false,
      response: apiError(409, 'conflict', 'Nomor invoice ini sudah dipakai. Gunakan nomor lain.'),
    };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      response: apiError(500, 'validation', `Gagal menyimpan data: ${body.slice(0, 200)}`),
    };
  }
  const row = (await response.json()) as { $id?: string };
  if (!row.$id) {
    return { ok: false, response: apiError(500, 'validation', 'Gagal menyimpan data.') };
  }
  return { ok: true, rowId: row.$id };
}
