import { mintJwt } from '../appwrite/client';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { appErrorFromStatus } from './errors';

/**
 * The Organization's contact identity block — the two-entity model's
 * replacement for the per-org profile ("letterhead") rows. Every read and
 * write goes through the org-gated Functions:
 *
 * - `GET /api/orgs/<id>` — member-readable current values.
 * - `PATCH /api/orgs/<id>` — owner-only updates (the server validates and
 *   answers 403 for members).
 *
 * The orgId is a hint the server re-verifies against the caller's active
 * membership row — never authority.
 */
export type OrgContact = {
  id: string;
  name: string;
  slug: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  taxId: string | null;
  logoFileId: string | null;
  businessType: string | null;
};

export type OrgContactPatch = {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  taxId?: string | null;
  logoFileId?: string | null;
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
    return typeof body?.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function assertOrgId(orgId: string): void {
  if (!/^org_[0-9a-f]{16}$/.test(orgId)) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Organisasi tidak valid.');
  }
}

export async function getOrgContact(orgId: string): Promise<OrgContact> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${encodeURIComponent(orgId)}`);
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    id: str(body.id),
    name: str(body.name),
    slug: nullableStr(body.slug),
    email: nullableStr(body.email),
    phone: nullableStr(body.phone),
    website: nullableStr(body.website),
    address: nullableStr(body.address),
    taxId: nullableStr(body.taxId),
    logoFileId: nullableStr(body.logoFileId),
    businessType: nullableStr(body.businessType),
  };
}

export async function updateOrgContact(orgId: string, patch: OrgContactPatch): Promise<void> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${encodeURIComponent(orgId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}

/**
 * Uploads a logo for the org through the same private-bucket Function the
 * profile flow used (`POST /api/logo`, session JWT in the header) and returns
 * the file id for `logoFileId`. The bucket entry is keyed by the uploader and
 * deleted through the same owner-checked DELETE.
 */
export async function uploadOrgLogo(file: File): Promise<string> {
  const jwt = await mintJwt().catch(() => {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.');
  });
  const form = new FormData();
  form.set('file', file);
  let response: Response;
  try {
    response = await fetch('/api/logo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = (await response.json().catch(() => ({}))) as { fileId?: unknown };
  if (typeof body.fileId !== 'string' || body.fileId === '') {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }
  return body.fileId;
}
