import { apiError, json } from '../../../_lib/http';
import { createRow, getRow, patchRow } from '../../../_lib/rows';
import { requireOrg } from '../../../_lib/orgs';
import type { Env, PagesFunction } from '../../../_lib/types';

/**
 * `GET /api/orgs/<id>/letterhead` — what THIS organization's invoices print:
 * business name, logo, header/footer, colors and the contact block. One row
 * per org (`letterheads/<orgId>`); missing rows answer defaults.
 * `PUT /api/orgs/<id>/letterhead` — upserts the provided fields.
 *
 * Deliberately separate from the shared user profile (`/api/profile/user`):
 * the letterhead is the ORGANIZATION's printed identity — every member of the
 * org may shape it (same access the per-org profile had), while the person's
 * username/phone live at the account level and never vary per org.
 *
 * Tenancy: `requireOrg` proves an ACTIVE membership before either method, and
 * the row id is taken from that gate, never from the body.
 */

const LIMITS = {
  businessName: 128,
  logoFileId: 64,
  headerTitle: 128,
  address: 512,
  phone: 32,
  email: 320,
  website: 320,
  footerText: 512,
  primaryColor: 16,
  secondaryColor: 16,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+?62|0)8\d{7,12}$/;

type LetterheadField = {
  key: keyof typeof LIMITS;
  /** Nullable columns answer `null` when unset (the row's storage shape). */
  nullable?: boolean;
  pattern?: RegExp;
};

const FIELDS: readonly LetterheadField[] = [
  { key: 'businessName', nullable: false },
  { key: 'logoFileId', nullable: true },
  { key: 'headerTitle', nullable: false },
  { key: 'address', nullable: true },
  { key: 'phone', nullable: false, pattern: PHONE_PATTERN },
  { key: 'email', nullable: false, pattern: EMAIL_PATTERN },
  { key: 'website', nullable: false },
  { key: 'footerText', nullable: false },
  { key: 'primaryColor', nullable: false },
  { key: 'secondaryColor', nullable: false },
];

const str = (row: Record<string, unknown> | null, key: keyof typeof LIMITS): string =>
  typeof row?.[key] === 'string' ? (row[key] as string) : '';

function letterheadView(row: Record<string, unknown> | null): Record<string, unknown> {
  return {
    businessName: str(row, 'businessName'),
    logoFileId: typeof row?.logoFileId === 'string' ? row.logoFileId : null,
    headerTitle: str(row, 'headerTitle'),
    address: typeof row?.address === 'string' ? row.address : null,
    phone: str(row, 'phone'),
    email: str(row, 'email'),
    website: str(row, 'website'),
    footerText: str(row, 'footerText'),
    primaryColor: str(row, 'primaryColor'),
    secondaryColor: str(row, 'secondaryColor'),
    updatedAt: str(row, 'updatedAt'),
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau PUT.', { allow: 'GET, PUT' });
  }

  const gate = await requireOrg(request, env, params.id);
  if (!gate.ok) return gate.response;
  const { auth, orgId } = gate.access;

  const row = await getRow(auth, 'letterheads', orgId, env);

  if (request.method === 'GET') {
    return json(200, letterheadView(row));
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

  // Patch semantics: absent key = untouched, `null` = clear, a value = set
  // after validation. `updatedAt` is stamped here, never taken from the body.
  const data: Record<string, unknown> = {};
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field.key)) continue;
    const raw = body[field.key];
    if (raw === null) {
      data[field.key] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      return apiError(400, 'validation', `Isian ${field.key} tidak valid.`);
    }
    const value = raw.trim();
    if (value.length > LIMITS[field.key]) {
      return apiError(400, 'validation', `Isian ${field.key} terlalu panjang.`);
    }
    if (field.pattern && value !== '' && !field.pattern.test(value)) {
      return apiError(
        400,
        'validation',
        field.key === 'email'
          ? 'Email organisasi tidak valid.'
          : 'Nomor WhatsApp organisasi tidak valid.',
      );
    }
    data[field.key] = value;
  }
  if (Object.keys(data).length === 0) {
    return apiError(400, 'validation', 'Tidak ada perubahan yang dikirim.');
  }
  data.updatedAt = new Date().toISOString();

  const saved = (await patchRow(auth, 'letterheads', orgId, data))
    ? letterheadView({ ...letterheadView(row), ...stripNulls(data) })
    : // A missing row (org created before this table existed) is created on
      // demand: unprovided fields start at their empty defaults.
      ((await createRow(
        auth,
        'letterheads',
        orgId,
        {
          ...Object.fromEntries(FIELDS.map((field) => [field.key, field.nullable ? null : ''])),
          ...data,
        },
        [],
      )) as Record<string, unknown> | null);
  if (!saved) {
    return apiError(503, 'unavailable', 'Gagal menyimpan kop surat. Coba lagi.');
  }

  return json(200, letterheadView(saved));
};

/** A patched `null` stays `null` in the response view, not an empty string. */
function stripNulls(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null));
}