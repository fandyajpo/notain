import type { BusinessProfile } from '../core/profile/model';
import { APPWRITE } from '../appwrite/config';
import { getTables, mintJwt } from '../appwrite/client';
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
 * The profile row uses the owner's user id as its row id, which gives us
 * one profile per user without an extra lookup.
 *
 * Writes go through `PUT /api/profile` rather than the SDK. The reason is
 * `plan`/`planExpiresAt`: Appwrite grants no per-column permissions, so a
 * session that can write its row can write every column on it, and a
 * client-side "never touch the plan" guard is only a guard against the honest
 * app. The Function takes the row id from the verified session, whitelists the
 * writable columns, and starts a new row at `free` — so a forged body cannot
 * bootstrap a paid plan. Reading stays a direct SDK read: the row is
 * owner-read-only, which Appwrite enforces for us.
 */
export class AppwriteProfileRepository implements ProfileRepository {
  async getByOwner(ownerId: string): Promise<BusinessProfile | null> {
    try {
      const row = await getTables().getRow<ProfileRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.profilesTableId,
        rowId: ownerId,
      });
      return profileRowToDomain(row);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw toAppError(error);
    }
  }

  async save(input: { ownerId: string; profile: BusinessProfile }): Promise<BusinessProfile> {
    try {
      const response = await fetch(`${profileApiBase()}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${await mintJwt()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input.profile),
      });

      // On success the body is the saved row; on failure it is the Function's
      // `{ error, message }`, from which only the copy is worth keeping.
      const body = await readJson(response);
      if (!response.ok) {
        throw appErrorFromStatus(response.status, messageOf(body));
      }
      return profileRowToDomain(body as ProfileRow);
    } catch (error) {
      throw toAppError(error);
    }
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
