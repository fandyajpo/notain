import { z } from 'zod';
import { businessSubtypeSlugSchema } from '../core/business/schema';
import { appErrorFromStatus } from './errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import type { BusinessSubtypeSlug } from '../core/business/taxonomy';

/**
 * The public business page's payload: what `GET /api/site/<ownerId>` answers
 * with behind the capability URL at `/site/<ownerId>`.
 *
 * Same contract as the public invoice read (`app/public-invoice.ts`):
 * unauthenticated by design — the owner's id segment is the credential — and
 * deliberately narrower than the stored row. Nothing here may leak fields the
 * owner never meant to publish: no plan, no R2 object id, no row timestamps.
 * The catalog is flattened to its display columns, so a page can never render
 * another tenant's internals even if a row is corrupt.
 */

/** One catalog entry, flattened to what a landing-page card renders. */
export type PublicSiteItem = {
  name: string;
  kind: 'barang' | 'jasa';
  unit?: string;
  /** Rupiah per `unit`. `0` means "no price configured" — cards show "Hubungi". */
  unitPrice: number;
};

/** The public, display-only view of the owner's profile. */
export type PublicSite = {
  businessName: string;
  /** The person behind the business — the invoice letterhead's name field. */
  ownerName: string;
  phone?: string;
  address?: string;
  email?: string;
  businessType: BusinessSubtypeSlug | null;
  logoUrl?: string;
};

export type PublicSitePayload = {
  site: PublicSite;
  items: PublicSiteItem[];
};

/**
 * Reads the page payload for one owner id.
 *
 * Errors map onto the app's error codes: 404 is "no such page" (no profile,
 * or a profile that never named a business), everything else falls through to
 * the shared status mapping — a 429 reads as the server's copy, a network
 * failure as the usual "check your connection" message.
 */
export async function getPublicSite(ownerId: string): Promise<PublicSitePayload> {
  let response: Response;
  try {
    response = await fetch(`/api/site/${encodeURIComponent(ownerId)}`);
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
  if (response.status === 404) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Halaman usaha tidak ditemukan.');
  }
  if (!response.ok) {
    let message: string | undefined;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // Non-JSON error body: fall through to the generic copy.
    }
    throw appErrorFromStatus(response.status, message);
  }

  return parsePayload(await response.json());
}

/**
 * Shape-level validation of the endpoint's response, mirroring
 * `parsePayload` in `public-invoice.ts`: a single corrupt field degrades
 * (`.catch(...)`) rather than blanking the whole page, while a wholly
 * malformed body 404s the page — an unusable payload is indistinguishable
 * from no page at all.
 */
function parsePayload(raw: unknown): PublicSitePayload {
  const result = publicSitePayloadSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Halaman usaha tidak ditemukan.');
  }
  return result.data;
}

const publicSitePayloadSchema = z.object({
  site: z.object({
    businessName: z.string().catch(''),
    ownerName: z.string().catch(''),
    phone: z.string().optional().catch(undefined),
    address: z.string().optional().catch(undefined),
    email: z.string().optional().catch(undefined),
    businessType: businessSubtypeSlugSchema.nullable().catch(null),
    logoUrl: z.string().optional().catch(undefined),
  }),
  items: z
    .array(
      z.object({
        name: z.string().catch(''),
        kind: z.enum(['barang', 'jasa']).catch('barang'),
        unit: z.string().optional().catch(undefined),
        unitPrice: z.number().min(0).catch(0),
      }),
    )
    .catch([]),
});
