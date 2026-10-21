import { getAccount } from '../appwrite/client';
import type { InvoiceDraft, InvoiceStatus } from '../core/invoice/model';
import type { AuthoredTemplate } from '../core/template/model';
import { appErrorFromStatus } from './errors';

export type AdminUser = {
  userId: string;
  /** Login email from the Appwrite account. */
  email: string;
  createdAt: string;
  /** Appwrite account status: false means the user is blocked (suspended). */
  status: boolean;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Optional business-contact email stored on the profile. */
  profileEmail: string;
  /** Business-type slug from the taxonomy; '' when the user never chose one. */
  businessType: string;
  plan: string;
  planExpiresAt: string | null;
};

export type AdminUserUpdate = {
  userId: string;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Profile (business-contact) email — distinct from the login email. */
  email: string;
  plan: string;
  planExpiresAt: string | null;
};

export type AdminUserPage = {
  users: AdminUser[];
  total: number;
  nextCursor: string | null;
};

export type AdminAuditRow = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

export type AdminAuditPage = {
  rows: AdminAuditRow[];
  total: number;
  nextCursor: string | null;
};

export type AdminSupportRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  source: string;
  createdAt: string;
  /** ISO timestamp the admin solved it; `null` while still open. */
  solvedAt: string | null;
  /** Email of the admin who solved it. */
  solvedBy: string | null;
};

export type AdminSupportPage = {
  rows: AdminSupportRow[];
  total: number;
  nextCursor: string | null;
};

export type AdminDrillResource = 'overview' | 'invoices' | 'customers' | 'templates';

export type AdminDrillOverview = {
  user: AdminUser;
  counts: { invoices: number; customers: number; templates: number };
};

export type AdminDrillRow = Record<string, unknown> & { id: string };

export type AdminDrillPage = {
  rows: AdminDrillRow[];
  total: number;
  nextCursor: string | null;
};

const DRILL_LIMIT = 20;

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const { jwt } = await getAccount().createJWT();
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

async function parseAdminResponse<T>(response: Response): Promise<T> {
  // Pages Functions do not run under `astro dev`, so the response may be
  // an HTML fallback rather than JSON. Detect that before parsing.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw appErrorFromStatus(
      response.status || 503,
      'Admin API tidak tersedia di mode development. Deploy ke Cloudflare Pages untuk menggunakannya.',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    // Carrying the status — not just the copy — is what lets the retry layer
    // tell a 404 or a 409 (the same request will fail the same way) apart from
    // a blip worth asking again.
    throw appErrorFromStatus(response.status, body?.message);
  }
  return (await response.json()) as T;
}

/** One page of the admin user list (cursor-paginated, newest first). */
export async function listAdminUsers(
  params: { cursorAfter?: string } = {},
): Promise<AdminUserPage> {
  const search = new URLSearchParams({ limit: '25' });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(`/api/admin/users?${search.toString()}`);
  return parseAdminResponse<AdminUserPage>(response);
}

export async function updateAdminUser(update: AdminUserUpdate): Promise<void> {
  const response = await adminFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  await parseAdminResponse<unknown>(response);
}

/** Suspends (blocks) or re-activates a user's Appwrite account. */
export async function setAdminUserStatus(
  userId: string,
  action: 'suspend' | 'unsuspend',
): Promise<{ status: boolean }> {
  const response = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  return parseAdminResponse<{ status: boolean }>(response);
}

/** Newest-first page of admin action logs. */
export async function listAdminAudit(
  params: { cursorAfter?: string } = {},
): Promise<AdminAuditPage> {
  const search = new URLSearchParams({ limit: '25' });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(`/api/admin/audit?${search.toString()}`);
  return parseAdminResponse<AdminAuditPage>(response);
}

/** Newest-first page of public support/contact messages. */
export async function listAdminSupport(
  params: { cursorAfter?: string } = {},
): Promise<AdminSupportPage> {
  const search = new URLSearchParams({ limit: '25' });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(`/api/admin/support?${search.toString()}`);
  return parseAdminResponse<AdminSupportPage>(response);
}

/** Marks a support message as solved, or reopens a solved one. */
export async function setAdminSupportSolved(
  id: string,
  solved: boolean,
): Promise<{ success: boolean; solvedAt: string | null; solvedBy: string | null }> {
  const response = await adminFetch(`/api/admin/support/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ solved }),
  });
  return parseAdminResponse(response);
}

/** Read-only drill-down into one user's data. */
export async function getAdminUserDrilldown(
  userId: string,
  resource: AdminDrillResource,
  params: { cursorAfter?: string } = {},
): Promise<AdminDrillOverview | AdminDrillPage> {
  const search = new URLSearchParams({ resource, limit: String(DRILL_LIMIT) });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}?${search.toString()}`,
  );
  return parseAdminResponse<AdminDrillOverview | AdminDrillPage>(response);
}

export function isDrillOverview(
  data: AdminDrillOverview | AdminDrillPage,
): data is AdminDrillOverview {
  return 'user' in data;
}

// --- "Konten pengguna": CRUD on one selected user's rows ---------------------

/**
 * The two resources the User Content Management tab manages. Each is
 * implemented once — the read, the writes and the hooks are not duplicated
 * per screen, and the server mirrors the same two names.
 */
export type AdminContentResource = 'templates' | 'invoices';

export type AdminTemplateRow = {
  id: string;
  /** Re-checked against the selected user before every write. */
  ownerId: string;
  name: string;
  businessType: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminInvoiceRow = {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  customerName: string;
  /** Read by the edit form; `''` means the column was never filled. */
  customerPhone: string;
  customerEmail: string;
  date: string;
  dueDate: string;
  /** `null` is "Belum dikirim" — the column's unset state. */
  status: 'sent' | 'paid' | 'void' | null;
};

export type AdminContentPage<R> = {
  rows: R[];
  total: number;
  nextCursor: string | null;
};

const CONTENT_LIMIT = 12;

async function listAdminContent<R>(
  userId: string,
  resource: AdminContentResource,
  cursorAfter?: string,
) {
  const search = new URLSearchParams({ userId, resource, limit: String(CONTENT_LIMIT) });
  if (cursorAfter) search.set('cursorAfter', cursorAfter);
  const response = await adminFetch(`/api/admin/content?${search.toString()}`);
  return parseAdminResponse<AdminContentPage<R>>(response);
}

/** One page of a single user's saved templates. */
export function listAdminTemplates(
  userId: string,
  cursorAfter?: string,
): Promise<AdminContentPage<AdminTemplateRow>> {
  return listAdminContent<AdminTemplateRow>(userId, 'templates', cursorAfter);
}

/** One page of a single user's invoices. */
export function listAdminInvoices(
  userId: string,
  cursorAfter?: string,
): Promise<AdminContentPage<AdminInvoiceRow>> {
  return listAdminContent<AdminInvoiceRow>(userId, 'invoices', cursorAfter);
}

async function postAdminContent(body: Record<string, unknown>): Promise<void> {
  const response = await adminFetch('/api/admin/content', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await parseAdminResponse<unknown>(response);
}

/** Copies a built-in design into `userId`'s `templates` rows under `name`. */
export function createAdminTemplate(input: {
  userId: string;
  name: string;
  base: 'classic' | 'minimal' | 'modern';
}): Promise<void> {
  return postAdminContent({
    userId: input.userId,
    resource: 'templates',
    action: 'create',
    template: { name: input.name, base: input.base },
  });
}

/**
 * One row's full content, read only when its edit dialog opens: layout, theme
 * and prose for a template; items, sections, notes and adjustments for an
 * invoice. The list never carries these — a user with fifty invoices would
 * otherwise download all of them to show five rows.
 */
export type AdminTemplateDetail = {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
} & AuthoredTemplate;

/** `{id, ownerId}` plus exactly the fields `invoiceDraftSchema` validates. */
export type AdminInvoiceDetail = {
  id: string;
  ownerId: string;
} & InvoiceDraft;

async function getAdminContentDetail<T>(
  userId: string,
  resource: AdminContentResource,
  rowId: string,
): Promise<T> {
  const search = new URLSearchParams({ userId, resource, rowId });
  const response = await adminFetch(`/api/admin/content?${search.toString()}`);
  return parseAdminResponse<T>(response);
}

export function getAdminTemplateDetail(
  userId: string,
  rowId: string,
): Promise<AdminTemplateDetail> {
  return getAdminContentDetail<AdminTemplateDetail>(userId, 'templates', rowId);
}

export function getAdminInvoiceDetail(userId: string, rowId: string): Promise<AdminInvoiceDetail> {
  return getAdminContentDetail<AdminInvoiceDetail>(userId, 'invoices', rowId);
}

/**
 * The next free invoice number for `userId`, derived server-side from the
 * numbers they already own. The create dialog opens with it, so an admin never
 * has to invent a sequence number (and then find out it collides).
 */
export async function getAdminNextInvoiceNumber(userId: string): Promise<{
  invoiceNumber: string;
}> {
  const search = new URLSearchParams({ userId, resource: 'invoices', nextNumber: '1' });
  const response = await adminFetch(`/api/admin/content?${search.toString()}`);
  return parseAdminResponse<{ invoiceNumber: string }>(response);
}

/**
 * Creates a full invoice for `userId`. The draft is exactly what the invoice
 * builder submits, so the server validates it with the same business rules.
 */
export function createAdminInvoice(input: { userId: string; draft: InvoiceDraft }): Promise<void> {
  return postAdminContent({
    userId: input.userId,
    resource: 'invoices',
    action: 'create',
    draft: input.draft,
  });
}

/**
 * Writes a template's whole design — name, blocks, colours and default prose —
 * exactly as the owner's editor does.
 *
 * `expectedUpdatedAt` is the `updatedAt` the dialog read the row with: the
 * server refuses the write when the row has moved on since (the owner saving
 * in their own editor, a second admin tab), instead of the two saves silently
 * clobbering each other.
 */
export function updateAdminTemplateContent(input: {
  userId: string;
  rowId: string;
  template: AuthoredTemplate;
  expectedUpdatedAt?: string;
}): Promise<void> {
  return postAdminContent({
    userId: input.userId,
    resource: 'templates',
    action: 'update',
    rowId: input.rowId,
    template: input.template,
    expectedUpdatedAt: input.expectedUpdatedAt,
  });
}

/**
 * Writes an invoice's content plus (optionally) a status change. The content
 * half is a `draftToRowUpdateData` write server-side, so it can never touch
 * the lifecycle; `status` is checked separately against the forward-only
 * chain.
 *
 * `expectedContentHash` is the fingerprint of the content the dialog loaded
 * (see `core/invoice/fingerprint`): the server refuses the write when the
 * row's content has moved on since, instead of the two saves clobbering each
 * other. Omit it and no baseline is checked — which is what the builder does.
 */
export function updateAdminInvoiceContent(input: {
  userId: string;
  rowId: string;
  draft: InvoiceDraft;
  status: InvoiceStatus | null;
  expectedContentHash?: string;
}): Promise<void> {
  return postAdminContent({
    userId: input.userId,
    resource: 'invoices',
    action: 'update',
    rowId: input.rowId,
    draft: input.draft,
    status: input.status,
    expectedContentHash: input.expectedContentHash,
  });
}

export function deleteAdminContent(input: {
  userId: string;
  resource: AdminContentResource;
  rowId: string;
}): Promise<void> {
  return postAdminContent({
    userId: input.userId,
    resource: input.resource,
    action: 'delete',
    rowId: input.rowId,
  });
}
