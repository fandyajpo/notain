import { requireAdmin } from '../../_lib/admin';
import { querySearchAll } from '../../_lib/appwrite';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

const DATABASE_ID = 'notain_db';
const SUPPORT_TABLE_ID = 'support';
const LIST_DEFAULT_LIMIT = 25;
const LIST_MAX_LIMIT = 50;

/**
 * `GET /api/admin/support` — newest-first page of public support/contact
 * messages, with `?limit=` (1–50, default 25) and `?cursorAfter=` for "Muat
 * lebih banyak". The rows are written anonymously through `/api/support` with
 * empty permissions, so this endpoint reads them with the API key and gates
 * on `admins` membership, same as the other admin lists.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
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

  const queries: Array<{ method: string; values: unknown[]; attribute?: string }> = [
    // Canonical order form — see admin/audit.ts: the `values` form sorts by
    // Appwrite's internal sequence column, not `createdAt`.
    { method: 'orderDesc', attribute: 'createdAt', values: [] },
    { method: 'limit', values: [limit] },
  ];
  if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

  const response = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${SUPPORT_TABLE_ID}/documents?${querySearchAll(queries)}`,
    { headers },
  );
  if (response.status === 404) {
    // Table not created yet — answer with an empty page so the tab renders
    // "Belum ada pesan" rather than a red banner.
    return json(200, { rows: [], total: 0, nextCursor: null });
  }
  if (!response.ok) {
    return apiError(500, 'validation', 'Gagal mengambil pesan support.');
  }

  const data = (await response.json()) as {
    documents: Array<{
      $id: string;
      name?: string | null;
      email?: string | null;
      subject?: string | null;
      message?: string | null;
      source?: string | null;
      createdAt?: string | null;
      solvedAt?: string | null;
      solvedBy?: string | null;
    }>;
    total: number;
  };

  return json(200, {
    rows: data.documents.map((doc) => ({
      id: doc.$id,
      name: doc.name ?? '',
      email: doc.email ?? '',
      subject: doc.subject ?? '',
      message: doc.message ?? '',
      source: doc.source ?? '',
      createdAt: doc.createdAt ?? '',
      solvedAt: doc.solvedAt ?? null,
      solvedBy: doc.solvedBy ?? null,
    })),
    total: data.total,
    nextCursor:
      data.documents.length === limit && limit > 0
        ? data.documents[data.documents.length - 1].$id
        : null,
  });
};
