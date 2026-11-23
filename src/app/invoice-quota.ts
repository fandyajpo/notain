import { bearerFetch } from './bearer-fetch';
import { appErrorFromStatus } from './errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { getActiveOrgId } from './active-org';

/**
 * The browser's half of the free tier's monthly invoice allowance.
 *
 * The server owns the number (`functions/_lib/invoice-quota.ts` counts the
 * ORGANIZATION's own rows and reads its plan); this module only asks it. That
 * split is the whole point: a limit the client could enforce would be a limit
 * a modified client ignores, and the pricing page promises "10 invoice baru
 * per bulan" as a product fact, not a suggestion.
 *
 * Two calls, both on the same org-scoped endpoint — the active organization
 * rides as the `orgId` hint the server re-verifies against the caller's
 * membership row:
 * - `fetchInvoiceQuota` — the sidebar/builder meter, read for the active org.
 * - `claimInvoiceQuota` — asked immediately before saving a *new* invoice.
 *   A denial arrives as a 402, mapped to a permanent, non-retriable
 *   `FORBIDDEN` error carrying the server's own upgrade copy.
 */

export type InvoiceQuota = {
  /** Invoices still creatable this month, or `null` on a paid plan. */
  remaining: number | null;
  /** Invoices created this calendar month. */
  used: number;
  /** The free-tier limit the pricing copy quotes. */
  limit: number;
  /** ISO instant at which the month (and the counter with it) rolls over. */
  resetsAt: string;
};

/**
 * `orgId` for the quota endpoint — the same failure mode the repositories
 * use when no organization is selected: a domain error the UI already knows
 * how to render, not an unscoped request the server would reject anyway.
 */
function quotaPath(orgId: string | null = getActiveOrgId()): string {
  if (!orgId) {
    throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
  }
  return `/api/quota/invoices?orgId=${encodeURIComponent(orgId)}`;
}

function parseQuota(body: unknown): InvoiceQuota | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Partial<InvoiceQuota>;
  if (typeof value.used !== 'number' || typeof value.limit !== 'number') return null;
  if (value.remaining !== null && typeof value.remaining !== 'number') return null;
  if (typeof value.resetsAt !== 'string') return null;
  return {
    remaining: value.remaining,
    used: value.used,
    limit: value.limit,
    resetsAt: value.resetsAt,
  };
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

/** The organization's current allowance — the number the builder's meter paints. */
export async function fetchInvoiceQuota(orgId: string): Promise<InvoiceQuota> {
  const response = await bearerFetch(quotaPath(orgId));
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const quota = parseQuota(await response.json().catch(() => null));
  if (!quota) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return quota;
}

/**
 * Asks the server for room to create one more invoice this month.
 *
 * Throws when there is none (402 → `FORBIDDEN` with the server's copy) or
 * when the answer could not be read (503 → a retryable error): a save that
 * proceeded on an unknown answer would make the limit advisory for exactly
 * the users it exists to bound.
 */
export async function claimInvoiceQuota(): Promise<InvoiceQuota> {
  const response = await bearerFetch(quotaPath(), { method: 'POST' });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = (await response.json().catch(() => null)) as { quota?: unknown } | null;
  const quota = parseQuota(body?.quota);
  if (!quota) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return quota;
}
