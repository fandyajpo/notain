import { mintJwt } from '../appwrite/client';
import { appErrorFromStatus, toAppError } from '../appwrite/errors';
import { AppError, ERROR_CODES, GENERIC_ERROR_MESSAGE } from '../core/shared/errors';
import type { AssetRepository, UploadedAsset, UploadAssetInput } from '../ports/asset-repository';

/**
 * Where the logo Pages Function lives, as the browser sees it.
 *
 * The default is a path, not a URL, on purpose: the deployed site is the only
 * consumer, so a relative base keeps the build free of any particular domain
 * and keeps upload, delete and `<img>` loads on the same origin — which is why
 * the Function never has to deal with CORS. `PUBLIC_LOGO_API` overrides it for
 * environments that are not the deployed site (the smoke test runs in Node,
 * where a path is not a URL).
 */
const DEFAULT_LOGO_API = '/api/logo';

function logoApiBase(): string {
  const configured = import.meta.env.PUBLIC_LOGO_API;
  const value = typeof configured === 'string' ? configured.trim() : '';
  return (value === '' ? DEFAULT_LOGO_API : value).replace(/\/+$/, '');
}

/**
 * Logos live in a private Cloudflare R2 bucket behind `functions/api/logo.ts`.
 *
 * The bucket has no public URL and no S3 credentials ever reach the browser:
 * the Function mints each object key itself, verifies the caller's Appwrite
 * session, and stores the owner in the object's metadata so a delete can prove
 * ownership rather than guess it from the key.
 *
 * The Appwrite Storage implementation this replaced is gone — there is no
 * second asset backend to fall back to.
 */
export class R2AssetRepository implements AssetRepository {
  async uploadLogo(input: UploadAssetInput): Promise<UploadedAsset> {
    try {
      const body = new FormData();
      // The third argument keeps the original file name: the Function derives
      // the stored `Content-Type` from its extension, never from `File.type`.
      body.append('file', input.file, input.file.name);

      const response = await fetch(`${logoApiBase()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await mintJwt()}` },
        body,
      });

      const payload = await readBody(response);
      if (!response.ok) throw appErrorFromStatus(response.status, payload.message);

      const fileId = payload.fileId;
      if (fileId === undefined) {
        throw new AppError(ERROR_CODES.UNKNOWN, GENERIC_ERROR_MESSAGE);
      }
      return { fileId, url: this.viewUrl(fileId) ?? '' };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(fileId: string): Promise<void> {
    try {
      const response = await fetch(`${logoApiBase()}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await mintJwt()}` },
      });
      // A file that is already gone is the outcome this call wanted, and the
      // Function answers 404 for other owners' keys too.
      if (response.ok || response.status === 404) return;
      throw appErrorFromStatus(response.status, (await readBody(response)).message);
    } catch (error) {
      throw toAppError(error);
    }
  }

  viewUrl(fileId: string | null | undefined): string | null {
    if (!fileId) return null;
    return `${logoApiBase()}/${encodeURIComponent(fileId)}`;
  }
}

type LogoApiResponse = { fileId?: string; message?: string };

async function readBody(response: Response): Promise<LogoApiResponse> {
  if (response.status === 204) return {};
  try {
    const body: unknown = await response.json();
    if (body === null || typeof body !== 'object') return {};
    const { fileId, message } = body as LogoApiResponse;
    return {
      ...(typeof fileId === 'string' && fileId !== '' ? { fileId } : {}),
      ...(typeof message === 'string' && message !== '' ? { message } : {}),
    };
  } catch {
    // A non-JSON body (a proxy error page, an HTML 404) says nothing useful
    // about what went wrong, so the status code alone decides the message.
    return {};
  }
}
