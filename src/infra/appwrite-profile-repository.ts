import type { BusinessProfile } from '../core/profile/model';
import { mintJwt } from '../appwrite/client';
import { appErrorFromStatus, toAppError } from '../appwrite/errors';
import { profileRowToDomain, type ProfileRow } from '../appwrite/mappers';
import type { ProfileRepository } from '../ports/profile-repository';

/**
 * Where the profile Pages Function lives, as the browser sees it. Same
 * reasoning as `DEFAULT_LOGO_API` in `r2-asset-repository.ts`: a relative path
 * keeps the build domain-free and keeps the call same-origin (no CORS), and
 * `PUBLIC_PROFILE_API` overrides it where a path is not a URL (the Node smoke
 * test).
 */
const DEFAULT_PROFILE_API = '/api/profile';

function profileApiBase(): string {
  const configured = import.meta.env.PUBLIC_PROFILE_API;
  const value = typeof configured === 'string' ? configured.trim() : '';
  return (value === '' ? DEFAULT_PROFILE_API : value).replace(/\/+$/, '');
}

/**
 * Read AND write go through the Function (`GET`/`PUT /api/profile?orgId=…`),
 * never the SDK — two reasons, both about tenancy:
 *
 * 1. The profile row id IS the organization id and its permissions are not
 *    member-shaped (Appwrite cannot express "members of org X"), so a direct
 *    SDK read would only work for whoever's session created the row. The
 *    Function re-verifies the caller's membership server-side instead.
 * 2. The plan lock: Appwrite grants no per-column permissions, so a session
 *    that can write its row can write `plan`/`planExpiresAt` on it. The
 *    Function whitelists the writable columns, takes the row id from the
 *    validated `orgId` query, and starts a new row at `free` — a forged body
 *    cannot bootstrap a paid plan.
 *
 * The `orgId` here is only a *hint*: the server answers 404 for anyone who
 * is not an active member, so a stale local value degrades to "no profile",
 * never to someone else's data.
 */
export class AppwriteProfileRepository implements ProfileRepository {
  async getByOrg(orgId: string): Promise<BusinessProfile | null> {
    try {
      const body = await this.call('GET', orgId);
      return profileRowToDomain(body as ProfileRow);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw toAppError(error);
    }
  }

  async save(input: { orgId: string; profile: BusinessProfile }): Promise<BusinessProfile> {
    try {
      const body = await this.call('PUT', input.orgId, input.profile);
      return profileRowToDomain(body as ProfileRow);
    } catch (error) {
      throw toAppError(error);
    }
  }

  /** One authenticated round trip against the profile Function. */
  private async call(
    method: 'GET' | 'PUT',
    orgId: string,
    body?: BusinessProfile,
  ): Promise<Record<string, unknown>> {
    const query = `?orgId=${encodeURIComponent(orgId)}`;
    const response = await fetch(`${profileApiBase()}${query}`, {
      method,
      headers: {
        Authorization: `Bearer ${await mintJwt()}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    // On success the body is the saved row; on failure it is the Function's
    // `{ error, message }`, from which only the copy is worth keeping.
    const parsed = await readJson(response);
    if (!response.ok) {
      throw appErrorFromStatus(response.status, messageOf(parsed));
    }
    return parsed;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 404
  );
}

/** Parsed JSON body, or `{}` for a 204, an empty or a non-JSON response. */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  try {
    const body: unknown = await response.json();
    if (body === null || typeof body !== 'object') return {};
    return body as Record<string, unknown>;
  } catch {
    // A non-JSON body (a proxy error page, an HTML 404) says nothing useful
    // about what went wrong, so the status code alone decides the message.
    return {};
  }
}

function messageOf(body: Record<string, unknown>): string | undefined {
  const { message } = body as { message?: unknown };
  return typeof message === 'string' && message !== '' ? message : undefined;
}
