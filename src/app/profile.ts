import { LOGO_ALLOWED_TYPES, LOGO_MAX_BYTES } from '../core/profile/logo';
import { profileSchema, type BusinessProfile } from '../core/profile/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { container } from '../infra/container';
import { requireActiveOrgId } from './active-org';
import { requireSession } from './session';

/**
 * The active organization's business profile. The profile row id IS the org
 * id (`docs/multi-tenancy.md`), so this is one Function read scoped by the
 * org the user currently works inside — no session-scoped profile exists
 * anymore.
 */
export async function getProfile(): Promise<BusinessProfile | null> {
  const orgId = requireActiveOrgId();
  const profile = await container.profiles.getByOrg(orgId);
  if (!profile) return null;
  return { ...profile, logoUrl: container.assets.viewUrl(profile.logoFileId) ?? undefined };
}

export async function saveProfile(input: BusinessProfile): Promise<BusinessProfile> {
  // Fail fast with "you are signed out" (the Function would 401 anyway, but
  // this names the cause before any network round trip).
  await requireSession();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Periksa kembali isian profil kamu.', {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
      ),
    });
  }
  // `plan` / `planExpiresAt` are owned by billing (the `organizations` row,
  // written by payment settle and the admin API) — never by a profile save.
  // Taking them from the input would let any signed-in client upgrade its own
  // plan, and it let a caller holding a stale copy (the smoke test's sample
  // profile) silently downgrade a paid account. The stored row wins; a
  // brand-new row starts on free.
  const orgId = requireActiveOrgId();
  const stored = await container.profiles.getByOrg(orgId);
  const saved = await container.profiles.save({
    orgId,
    profile: {
      ...parsed.data,
      businessName: parsed.data.businessName ?? '',
      phone: parsed.data.phone ?? '',
      plan: stored?.plan ?? 'free',
      planExpiresAt: stored?.planExpiresAt ?? null,
    },
  });
  return { ...saved, logoUrl: container.assets.viewUrl(saved.logoFileId) ?? undefined };
}

/** Uploads a new logo, replacing any previous one, and persists the id. */
export async function uploadLogo(file: File, current: BusinessProfile): Promise<BusinessProfile> {
  // Fail fast with "you are signed out" rather than minting a JWT the logo
  // API would reject a moment later.
  await requireSession();
  validateLogoFile(file);

  const previousFileId = current.logoFileId;

  // Order matters: upload → persist → delete the old file. Deleting first (as
  // this did previously) means a failed `saveProfile` leaves the row pointing
  // at a file that is already gone, losing the logo for good.
  const asset = await container.assets.uploadLogo({ file });

  try {
    const saved = await saveProfile({ ...current, logoFileId: asset.fileId });
    if (previousFileId && previousFileId !== asset.fileId) {
      // The row is already safe, so a failed delete only wastes storage —
      // swallowing it beats surfacing an error for a logo that now works.
      await container.assets.remove(previousFileId).catch(() => undefined);
    }
    return saved;
  } catch (error) {
    // The row still points at the previous logo, so keep that file. Cleaning
    // up the fresh upload turns a failed save into harmless orphaned storage
    // instead of a broken invoice header.
    await container.assets.remove(asset.fileId).catch(() => undefined);
    throw error;
  }
}

export async function removeLogo(current: BusinessProfile): Promise<BusinessProfile> {
  if (!current.logoFileId) return current;
  const fileId = current.logoFileId;
  // Persist first so a failed save leaves the record pointing at a file that
  // still exists; only then is the file safe to delete.
  const saved = await saveProfile({ ...current, logoFileId: undefined });
  await container.assets.remove(fileId).catch(() => undefined);
  return saved;
}

function validateLogoFile(file: File): void {
  if (!LOGO_ALLOWED_TYPES.includes(file.type as (typeof LOGO_ALLOWED_TYPES)[number])) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Format logo harus PNG, JPG, SVG, WEBP, atau ICO.');
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Logo terlalu besar. Maksimal 2 MB.');
  }
}
