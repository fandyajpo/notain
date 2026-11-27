import { writeAudit } from '../../../_lib/audit';
import { requireAdmin } from '../../../_lib/admin';
import { apiError, fetchUpstream as fetch, json, readJson } from '../../../_lib/http';
import type { Env, PagesFunction } from '../../../_lib/types';

const DATABASE_ID = 'notain_db';
const SUPPORT_TABLE_ID = 'support';

/**
 * `PATCH /api/admin/support/[id]` — marks one support message as solved
 * (`{ solved: true }`) or reopens it (`{ solved: false }`).
 *
 * Solving stamps `solvedAt` with the server clock and `solvedBy` with the
 * admin's email, so the list can show who closed it; reopening clears both.
 * Every change lands in the audit trail. Admin-only, same wall as the list.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = params.id;
  if (!id) return apiError(400, 'validation', 'id pesan wajib diisi.');

  if (request.method !== 'PATCH') {
    return apiError(405, 'method_not_allowed', 'Gunakan PATCH.');
  }

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;
  const { endpoint, headers, session } = gate.admin;

  const body = await readJson(request);
  if (typeof body?.solved !== 'boolean') {
    return apiError(400, 'validation', 'solved harus true atau false.');
  }
  const solved = body.solved;

  const data = solved
    ? { solvedAt: new Date().toISOString(), solvedBy: session.email }
    : { solvedAt: null, solvedBy: null };

  const response = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${SUPPORT_TABLE_ID}/documents/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    },
  );
  if (response.status === 404) {
    return apiError(404, 'not_found', 'Pesan tidak ditemukan.');
  }
  if (!response.ok) {
    // The upstream body carries collection names and provider internals — it
    // goes to the logs, never to the client, exactly as the other admin
    // writes do. A failed upstream write is an outage (503), not bad input.
    const detail = (await response.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
    console.error('admin.support: status change failed:', detail);
    return apiError(503, 'unavailable', 'Status pesan tidak tersimpan. Coba lagi.');
  }

  await writeAudit(env, {
    actorId: session.userId,
    actorEmail: session.email,
    action: solved ? 'support.solve' : 'support.reopen',
    targetType: 'support',
    targetId: id,
    detail: JSON.stringify({ solved }),
  });

  return json(200, { success: true, ...data });
};
