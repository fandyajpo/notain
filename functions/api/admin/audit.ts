import { auditRowToApi } from '../../_lib/audit';
import { requireAdmin } from '../../_lib/admin';
import { querySearch } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

const DATABASE_ID = 'notain_db';
const AUDIT_TABLE_ID = 'audit_logs';
const LIST_DEFAULT_LIMIT = 25;
const LIST_MAX_LIMIT = 50;

/**
 * `GET /api/admin/audit` — newest-first page of admin action logs, with
 * `?limit=` (1–50, default 25) and `?cursorAfter=<documentId>` for "Muat
 * lebih banyak". Rows are readable only by the `admins` team (row permission
 * set by `writeAudit`); this endpoint re-checks membership anyway.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET.');
  }

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;
  const { endpoint, headers } = gate.admin;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), LIST_MAX_LIMIT)
      : LIST_DEFAULT_LIMIT;
  const cursor = url.searchParams.get('cursorAfter');

  const queries = [querySearch('orderDesc', ['createdAt']), querySearch('limit', [limit])];
  if (cursor) queries.push(querySearch('cursorAfter', [cursor]));

  const response = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${AUDIT_TABLE_ID}/documents?${queries.join('&')}`,
    { headers },
  );
  if (response.status === 404) {
    // Table not created yet — answer with an empty page instead of an error
    // so the tab renders "Belum ada aktivitas" rather than a red banner.
    return json(200, { rows: [], total: 0, nextCursor: null });
  }
  if (!response.ok) {
    return apiError(500, 'validation', 'Gagal mengambil log aktivitas.');
  }

  const data = (await response.json()) as {
    documents: Array<{
      $id: string;
      actorId?: string | null;
      actorEmail?: string | null;
      action?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      detail?: string | null;
      createdAt?: string | null;
    }>;
    total: number;
  };

  return json(200, {
    rows: data.documents.map(auditRowToApi),
    total: data.total,
    nextCursor:
      data.documents.length === limit && limit > 0
        ? data.documents[data.documents.length - 1].$id
        : null,
  });
};
