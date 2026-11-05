import { writeAudit } from '../../_lib/audit';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import {
  deleteRow,
  getRow,
  listRows,
  listRowsPage,
  patchRow,
  tableAuth,
  type TableAuth,
} from '../../_lib/rows';
import { requireOrgOwner } from '../../_lib/orgs';
import { isBusinessSubtypeSlug } from '../../../src/core/business/taxonomy';
import type { Session } from '../../_lib/appwrite';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `PATCH  /api/orgs/<id>` — rename and/or set the business type (owner only).
 * `DELETE /api/orgs/<id>` — delete the organization and EVERYTHING under it.
 *
 * The delete is a **budgeted cascade the client loops over**: Cloudflare's
 * Free plan allows ~50 subrequests per invocation, so one request cannot wipe
 * an org with thousands of rows. Each call deletes up to {@link BUDGET} rows
 * (memberships first — they cut access immediately), answers
 * `{ done: false }`, and the caller repeats until `{ done: true }`. The org
 * row itself is deleted LAST, which is what makes the loop possible:
 *
 * - While it exists, the continuation authorizes against `org.ownerId` (the
 *   membership rows are already gone, so `requireOrgOwner` would 404).
 * - Once it's gone, the next call finds nothing and answers `{ done: true }`
 *   — the loop's terminal state, not an error.
 * - Only the original owner can drive either path; a member can never delete
 *   an org, and nobody else can continue a wipe that has begun.
 *
 * What is deleted (owner's choice: an org's data dies with it): every
 * `memberships` row, then `invoices`, `customers`, `catalog`, `templates`,
 * `stats`, `payments`, `audit_logs` rows carrying the orgId, then the
 * `profiles/<orgId>` legacy business-identity row and logo, then the current
 * organization logo and root row. Personal `profiles/<userId>` rows are never
 * included. Payment history goes too — the owner
 * knowingly accepted that a deleted org takes its billing record with it.
 */

/** Rows one invocation may delete, leaving headroom under the 50-subrequest cap. */
const BUDGET = 30;

/** Cascade order: access first, money/audit in the middle, identity, root last. */
const CASCADE_TABLES = [
  'memberships',
  'invoices',
  'customers',
  'catalog',
  'templates',
  'stats',
  'payments',
  'audit_logs',
] as const;

const NAME_MAX = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+?62|0)8\d{7,12}$/;

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const orgId = typeof params.id === 'string' ? params.id : '';

  // Owner-only identity read, same gate as the PATCH below: the Settings
  // contact editor disables its form for members, and the server enforces
  // that here rather than trusting the disabled inputs.
  if (request.method === 'GET') {
    const gate = await requireOrgOwner(request, env, orgId);
    if (!gate.ok) return gate.response;
    const org = await getRow(gate.access.auth, 'organizations', orgId, env);
    if (!org) return apiError(404, 'not_found', 'Organisasi tidak ditemukan.');
    const str = (key: string): string | null =>
      typeof org[key] === 'string' && (org[key] as string) !== '' ? (org[key] as string) : null;
    return json(200, {
      id: orgId,
      name: str('name') ?? '',
      slug: str('slug'),
      email: str('email'),
      phone: str('phone'),
      website: str('website'),
      address: str('address'),
      taxId: str('taxId'),
      logoFileId: str('logoFileId'),
      businessType: str('businessType'),
    });
  }

  if (request.method === 'PATCH') {
    const gate = await requireOrgOwner(request, env, orgId);
    if (!gate.ok) return gate.response;

    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await request.json();
      if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      body = null;
    }
    if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const hasName = typeof body.name === 'string';
    if (hasName && (name === '' || name.length > NAME_MAX)) {
      return apiError(400, 'validation', 'Nama organisasi wajib diisi (maksimal 128 karakter).');
    }

    // `businessType` is the org's trade slug. `null` clears it; anything else
    // must be a slug the taxonomy still knows, so a typo cannot poison every
    // template/picker read that groups by it.
    const hasBusinessType = Object.prototype.hasOwnProperty.call(body, 'businessType');
    let businessType: string | null = null;
    if (hasBusinessType) {
      const raw = body.businessType;
      if (raw === null || raw === '') {
        businessType = null;
      } else if (typeof raw === 'string' && isBusinessSubtypeSlug(raw)) {
        businessType = raw;
      } else {
        return apiError(400, 'validation', 'Jenis bisnis tidak dikenal.');
      }
    }

    const data: Record<string, unknown> = {};
    if (hasName) data.name = name;
    if (hasBusinessType) data.businessType = businessType;

    // The org's contact identity block (email, phone, website, address,
    // taxId) — what the public page and the letterhead read. Same
    // hasOwnProperty semantics as businessType: absent = untouched,
    // null = clear, a value = set after validation.
    const CONTACT_LIMITS = {
      email: 320,
      phone: 32,
      website: 320,
      address: 512,
      taxId: 64,
    } as const;
    for (const field of Object.keys(CONTACT_LIMITS) as (keyof typeof CONTACT_LIMITS)[]) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const raw = body[field];
      if (raw === null || raw === '') {
        data[field] = null;
        continue;
      }
      if (typeof raw !== 'string') {
        return apiError(400, 'validation', 'Isian kontak organisasi tidak valid.');
      }
      const value = raw.trim();
      if (value.length > CONTACT_LIMITS[field]) {
        return apiError(400, 'validation', `Isian ${field} terlalu panjang.`);
      }
      if (field === 'email' && value !== '' && !EMAIL_PATTERN.test(value)) {
        return apiError(400, 'validation', 'Email organisasi tidak valid.');
      }
      if (field === 'phone' && value !== '' && !PHONE_PATTERN.test(value)) {
        return apiError(400, 'validation', 'Nomor WhatsApp organisasi tidak valid.');
      }
      data[field] = value;
    }

    if (Object.keys(data).length === 0) {
      return apiError(400, 'validation', 'Tidak ada perubahan yang dikirim.');
    }

    if (!(await patchRow(gate.access.auth, 'organizations', orgId, data))) {
      return apiError(500, 'unavailable', 'Gagal menyimpan organisasi. Coba lagi.');
    }

    await writeAudit(env, {
      actorId: gate.access.session.userId,
      actorEmail: gate.access.session.email,
      action: 'org.update',
      targetType: 'organization',
      targetId: orgId,
      detail: JSON.stringify(data),
      orgId,
    });
    return json(200, { ok: true, ...data });
  }

  if (request.method === 'DELETE') {
    // Path A: the normal gate (membership still exists).
    const gate = await requireOrgOwner(request, env, orgId);
    let auth: TableAuth;
    // Both branches below assign this before anything reads it (the else
    // branch exits early when there is no session), so it starts unassigned.
    let session: Session | null;

    if (gate.ok) {
      auth = gate.access.auth;
      session = gate.access.session;
    } else {
      // Path B: a continuation — memberships are already deleted, so the gate
      // can only be satisfied by the org row's ownerId. Anything else (no
      // session, foreign org, malformed id) is refused exactly as before.
      if (gate.response.status !== 404) return gate.response;
      session = await verifySession(request, env);
      if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
      const gatedAuth = tableAuth(env);
      if (!gatedAuth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');
      auth = gatedAuth;
      const org = await getRow(auth, 'organizations', orgId, env);
      if (!org) return json(200, { done: true }); // already gone — loop ends
      if (org.ownerId !== session.userId) {
        return apiError(404, 'not_found', 'Organisasi tidak ditemukan.');
      }
    }

    const paymentGuard = await guardLivePayments(auth, orgId, env);
    if (paymentGuard) return paymentGuard;

    let budget = BUDGET;

    // 1. Access is cut before anything else: even if this call runs out of
    //    budget, nobody but the owner can reach the remaining rows.
    for (const table of CASCADE_TABLES) {
      if (budget <= 0) break;
      const rows = await listRows(
        auth,
        table,
        [
          { method: 'equal', attribute: 'orgId', values: [orgId] },
          { method: 'limit', values: [Math.min(budget, 100)] },
        ],
        env,
      );
      if (rows === null) {
        // Retry continues where this stopped.
        return apiError(503, 'unavailable', 'penghapusan terhenti, coba lagi.');
      }
      for (const row of rows) {
        if (budget <= 0) break;
        // A failed delete is NOT counted as done: the next loop retries it.
        if (await deleteRow(auth, table, row.$id, env)) budget -= 1;
        else break;
      }
    }

    // 2. The business-identity row + its logo (budget permitting).
    if (budget > 0) {
      const profile = await getRow(auth, 'profiles', orgId, env);
      if (profile) {
        const logoFileId = typeof profile.logoFileId === 'string' ? profile.logoFileId : '';
        if (logoFileId !== '') {
          try {
            await env.LOGOS.delete(logoFileId);
          } catch {
            return apiError(503, 'unavailable', 'Gagal menghapus logo organization. Coba lagi.');
          }
        }
        if (await deleteRow(auth, 'profiles', orgId, env)) budget -= 1;
      }
    }

    // 3. The root last (see header) — and only when its dependants are gone,
    //    otherwise the next loop could not authorize against the owner anymore.
    if (budget > 0) {
      const leftovers = [];
      for (const table of CASCADE_TABLES) {
        const rows = await listRows(
          auth,
          table,
          [
            { method: 'equal', attribute: 'orgId', values: [orgId] },
            { method: 'limit', values: [1] },
          ],
          env,
        );
        if (rows === null) {
          return apiError(503, 'unavailable', 'Verifikasi penghapusan gagal. Coba lagi.');
        }
        if (rows.length > 0) leftovers.push(table);
      }
      const profileRows = await listRows(
        auth,
        'profiles',
        [
          { method: 'equal', attribute: '$id', values: [orgId] },
          { method: 'limit', values: [1] },
        ],
        env,
      );
      if (profileRows === null) {
        return apiError(503, 'unavailable', 'Verifikasi profil organisasi gagal. Coba lagi.');
      }
      if (profileRows.length > 0) leftovers.push('profiles');
      if (leftovers.length === 0) {
        const organization = await getRow(auth, 'organizations', orgId, env);
        if (!organization) {
          return apiError(503, 'unavailable', 'Verifikasi organization gagal. Coba lagi.');
        }
        const orgLogoFileId =
          typeof organization.logoFileId === 'string' ? organization.logoFileId : '';
        if (orgLogoFileId !== '') {
          try {
            await env.LOGOS.delete(orgLogoFileId);
          } catch {
            return apiError(503, 'unavailable', 'Gagal menghapus logo organization. Coba lagi.');
          }
        }
        if (!(await deleteRow(auth, 'organizations', orgId, env))) {
          return apiError(503, 'unavailable', 'Gagal menghapus organization. Coba lagi.');
        }
        if (session) {
          await writeAudit(env, {
            actorId: session.userId,
            actorEmail: session.email,
            action: 'org.delete',
            targetType: 'organization',
            targetId: orgId,
            orgId,
          });
        }
        return json(200, { done: true });
      }
    }

    return json(200, { done: false });
  }

  return apiError(405, 'method_not_allowed', 'Gunakan PATCH atau DELETE.', {
    allow: 'PATCH, DELETE',
  });
};

/** Refuse deletion while DOKU may still settle money or paid activation is incomplete. */
async function guardLivePayments(
  auth: TableAuth,
  orgId: string,
  env: Env,
): Promise<Response | null> {
  const page = await listRowsPage(
    auth,
    'payments',
    [
      { method: 'equal', attribute: 'orgId', values: [orgId] },
      { method: 'orderAsc', attribute: '$id', values: [] },
      { method: 'limit', values: [1000] },
    ],
    env,
  );
  if (!page) {
    return apiError(503, 'unavailable', 'Status pembayaran tidak bisa diverifikasi. Coba lagi.');
  }
  if (page.total > page.rows.length) {
    return apiError(503, 'unavailable', 'Riwayat pembayaran terlalu besar untuk diverifikasi.');
  }

  const now = Date.now();
  const protectedOrder = page.rows.some((row) => {
    if (row.status === 'paid' && row.activationStatus === 'pending') return true;
    if (row.status !== 'pending') return false;
    const expiry = typeof row.dokuExpiredAt === 'string' ? Date.parse(row.dokuExpiredAt) : NaN;
    return (
      row.dokuExpiredAt == null ||
      row.dokuExpiredAt === '' ||
      !Number.isFinite(expiry) ||
      expiry > now
    );
  });
  return protectedOrder
    ? apiError(
        409,
        'conflict',
        'Organisasi belum bisa dihapus selama pembayaran masih aktif atau aktivasi paket sedang diproses.',
      )
    : null;
}
