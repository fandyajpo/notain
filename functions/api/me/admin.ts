import { isAdminUser } from '../../_lib/admin';
import { querySearch, verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { fetchUpstream as fetch } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/me/admin` — "is the signed-in account a platform admin?"
 *
 * This is the CLIENT-SAFE version of the same check `requireAdmin` makes. The
 * sidebar used to ask Appwrite directly (`GET /teams/admins/memberships` via
 * the SDK), and Appwrite hides team existence from non-members: every normal
 * account got a `404 team_not_found` on every page load. That is correct
 * behaviour from Appwrite and was treated as "not an admin", but it turned up
 * as a scary console error for every ordinary user, and it leaked the
 * operator team's id into the browser.
 *
 * Answering it here instead costs one extra server call that is already
 * cached per isolate (`checkAdmin`, 60 s) and answers 200 either way:
 *
 * - `{ isAdmin: true }` — the account is in the `admins` team (operators).
 * - `{ isAdmin: false }` — everyone else, including an unconfigured server
 *   (the check fails closed, so an outage degrades to "not an admin").
 *
 * Organizations do NOT use Appwrite Teams: membership is the `memberships`
 * collection (`functions/_lib/orgs.ts`), enforced per request by `requireOrg`.
 * This endpoint is only ever about the platform-operator wall in front of
 * `/api/admin/*`.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET.', { allow: 'GET' });
  }

  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  // Ask with the CALLER'S OWN JWT first — exactly what the browser SDK used to
  // do, so it needs no extra API-key scope and cannot be blocked by a key that
  // only carries documents/users scopes. Only when that path cannot answer (no
  // token, or a refused probe) fall back to the API-key check, which is what
  // the anonymous/cross-user gates use.
  //
  // Deliberately NOT routed through `checkAdmin`: that helper caches its
  // answer per userId for a minute, and a JWT-shaped denial would poison the
  // fallback that runs right after it.
  if (endpoint && projectId && token) {
    try {
      const response = await fetch(
        `${endpoint}/teams/admins/memberships?${querySearch('equal', [session.userId], 'userId')}`,
        { headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': token } },
      );
      if (response.ok) {
        const data = (await response.json()) as { total?: number };
        if ((data.total ?? 0) > 0) return json(200, { isAdmin: true });
      }
    } catch {
      // Fall through to the API-key check.
    }
  }

  return json(200, { isAdmin: await isAdminUser(session.userId, env) });
};
