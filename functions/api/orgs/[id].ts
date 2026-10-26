import { writeAudit } from '../../_lib/audit';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { deleteRow, getRow, listRows, patchRow, tableAuth, type TableAuth } from '../../_lib/rows';
import { requireOrgOwner } from '../../_lib/orgs';
import type { Session } from '../../_lib/appwrite';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `PATCH  /api/orgs/<id>` — rename (owner only).
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
 * `profiles/<orgId>` business-identity row and its R2 logo object, and
 * finally the `organizations` row. Payment history goes too — the owner
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

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const orgId = typeof params.id === 'string' ? params.id : '';

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
    if (name === '' || name.length > NAME_MAX) {
      return apiError(400, 'validation', 'Nama organisasi wajib diisi (maksimal 128 karakter).');
    }

    if (!(await patchRow(gate.access.auth, 'organizations', orgId, { name }))) {
      return apiError(500, 'unavailable', 'Gagal menyimpan nama organisasi. Coba lagi.');
    }

    // The org's name IS the business name (onboarding creates them equal,
    // and the profile form no longer edits `businessName` separately) — so
    // the invoice-facing `profiles/<orgId>.businessName` follows the rename.
    // Synced AFTER the org write as best effort: the rename already landed
    // and is what the switcher shows; a transient profile failure here must
    // not undo it, and the next rename (or profile save) converges the two.
    const profile = await getRow(gate.access.auth, 'profiles', orgId, env);
    if (profile) {
      await patchRow(gate.access.auth, 'profiles', orgId, { businessName: name });
    }

    await writeAudit(env, {
      actorId: gate.access.session.userId,
      actorEmail: gate.access.session.email,
      action: 'org.rename',
      targetType: 'organization',
      targetId: orgId,
      detail: JSON.stringify({ name }),
      orgId,
    });
    return json(200, { ok: true, name });
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
        return apiError(503, 'unavailable', 'penghapusan terhenti, coba lagi.'); // retry continues where this stopped
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
          // Best effort: an orphaned logo object costs pennies and this call
          // must not fail the wipe over storage cleanup.
          await env.LOGOS.delete(logoFileId).catch(() => undefined);
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
        if (rows?.length) leftovers.push(table);
      }
      const profileLeft = await getRow(auth, 'profiles', orgId, env);
      if (profileLeft) leftovers.push('profiles');
      if (leftovers.length === 0) {
        await deleteRow(auth, 'organizations', orgId, env);
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
