import { querySearch, verifySession, type Session } from './appwrite';
import { apiError } from './http';
import type { Env } from './types';

const ADMIN_TEAM_ID = 'admins';

/** Verified caller plus the API-key plumbing every admin call needs. */
export type AdminRequest = {
  session: Session;
  endpoint: string;
  headers: Record<string, string>;
};

/**
 * The shared auth wall for `/api/admin/*`: a real session (JWT → `GET
 * /account`), complete server config, and membership in the `admins` team.
 *
 * Returns a discriminated union so each caller's first lines read as
 * `const gate = await requireAdmin(...); if (!gate.ok) return gate.response;`
 * and the success path holds everything needed to talk to Appwrite with the
 * API key (which never reaches the browser).
 */
export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ ok: true; admin: AdminRequest } | { ok: false; response: Response }> {
  const session = await verifySession(request, env);
  if (!session) {
    return {
      ok: false,
      response: apiError(401, 'unauthenticated', 'Sesi tidak valid. Masuk ulang.'),
    };
  }

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    return {
      ok: false,
      response: apiError(500, 'validation', 'Konfigurasi server tidak lengkap.'),
    };
  }

  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  const isAdmin = await checkAdmin(endpoint, headers, session.userId);
  if (!isAdmin) {
    return { ok: false, response: apiError(403, 'unauthenticated', 'Kamu bukan admin.') };
  }

  return { ok: true, admin: { session, endpoint, headers } };
}

async function checkAdmin(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${endpoint}/teams/${ADMIN_TEAM_ID}/memberships?${querySearch('equal', [userId], 'userId')}`,
      { headers },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { total?: number };
    return (data.total ?? 0) > 0;
  } catch {
    return false;
  }
}
