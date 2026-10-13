import type { Env } from './types';

export type Session = { userId: string };

/**
 * Resolves the Appwrite session a request carries.
 *
 * The browser mints a JWT with `account.createJWT()` and sends it as
 * `Authorization: Bearer …`; the Function then calls `GET /account` with that
 * JWT to learn *who* is calling. That endpoint answers without an API key, so
 * the project never has to store a server credential — the only secret here is
 * one the caller already holds, and it expires on Appwrite's schedule.
 *
 * Returns `null` for every failure mode: no header, a JWT that is expired or
 * was revoked, or a Function that is missing its `[vars]`.
 */
export async function verifySession(request: Request, env: Env): Promise<Session | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) return null;

  try {
    const response = await fetch(`${endpoint}/account`, {
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': token },
    });
    if (!response.ok) return null;
    const account = (await response.json()) as { $id?: unknown };
    return typeof account.$id === 'string' && account.$id !== '' ? { userId: account.$id } : null;
  } catch {
    // Appwrite unreachable: fail closed. Never let an unverified caller in.
    return null;
  }
}
