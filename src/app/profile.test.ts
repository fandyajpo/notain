import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { SessionUser } from '../ports/auth-repository';
import type { BusinessProfile } from '../core/profile/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { getByOrg, save } = vi.hoisted(() => ({ getByOrg: vi.fn(), save: vi.fn() }));
const { uploadAsset, removeAsset, viewUrl } = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  removeAsset: vi.fn(),
  viewUrl: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    profiles: { getByOrg, save },
    assets: { uploadLogo: uploadAsset, remove: removeAsset, viewUrl },
  },
}));

const { removeLogo, saveProfile, uploadLogo } = await import('./profile');
const { forgetSession } = await import('./session');
const { setActiveOrgId } = await import('./active-org');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };
/** The active org every profile read/write is scoped to. */
const ORG = 'org_aaaaaaaaaaaaaaaa';

function logoFile(): File {
  return new File(['png-bytes'], 'logo.png', { type: 'image/png' });
}

function profile(logoFileId?: string): BusinessProfile {
  return {
    name: 'Bengkel Fa',
    phone: '081234567890',
    logoFileId,
    plan: 'free',
    planExpiresAt: null,
  };
}

beforeEach(() => {
  // `session.ts` memoizes the user across tests; a stale cache would make the
  // "requires a session" cases see the previous account instead of a null.
  forgetSession();
  getSession.mockReset();
  getByOrg.mockReset();
  save.mockReset();
  // Profile reads/writes are org-scoped; without an active org every call
  // would throw before reaching the repository.
  setActiveOrgId(ORG);
  uploadAsset.mockReset();
  removeAsset.mockReset();
  viewUrl.mockReset();

  getSession.mockResolvedValue(ALICE);
  removeAsset.mockResolvedValue(undefined);
  viewUrl.mockImplementation((fileId: string | null | undefined) =>
    fileId ? `/api/logo/${fileId}` : null,
  );
});

describe('uploadLogo', () => {
  it('deletes the previous logo only after the new one is saved', async () => {
    uploadAsset.mockResolvedValue({ fileId: 'logos_new', url: '' });
    save.mockResolvedValue(profile('logos_new'));

    const saved = await uploadLogo(logoFile(), profile('logos_old'));

    expect(saved.logoFileId).toBe('logos_new');
    expect(removeAsset).toHaveBeenCalledTimes(1);
    expect(removeAsset).toHaveBeenCalledWith('logos_old');
    expect(save).toHaveBeenCalledWith({
      orgId: ORG,
      profile: expect.objectContaining({ logoFileId: 'logos_new' }),
    });
    // The row must already point at the new file before the old one goes —
    // deleting first would break the invoice header if the save failed.
    expect(save.mock.invocationCallOrder[0]!).toBeLessThan(
      removeAsset.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves storage alone when there is no previous logo', async () => {
    uploadAsset.mockResolvedValue({ fileId: 'logos_first', url: '' });
    save.mockResolvedValue(profile('logos_first'));

    await uploadLogo(logoFile(), profile());

    expect(removeAsset).not.toHaveBeenCalled();
  });

  it('keeps the old logo and discards the fresh upload when saving fails', async () => {
    uploadAsset.mockResolvedValue({ fileId: 'logos_new', url: '' });
    save.mockRejectedValue(new AppError(ERROR_CODES.VALIDATION, 'Periksa profil.'));

    await expect(uploadLogo(logoFile(), profile('logos_old'))).rejects.toThrow();

    expect(removeAsset).toHaveBeenCalledTimes(1);
    expect(removeAsset).toHaveBeenCalledWith('logos_new');
    expect(removeAsset).not.toHaveBeenCalledWith('logos_old');
  });

  it('still succeeds when deleting the old file fails', async () => {
    uploadAsset.mockResolvedValue({ fileId: 'logos_new', url: '' });
    save.mockResolvedValue(profile('logos_new'));
    removeAsset.mockRejectedValue(new Error('r2 unreachable'));

    // The new logo already works; a stranded old object is a storage cost,
    // not a reason to fail the upload in front of the user.
    await expect(uploadLogo(logoFile(), profile('logos_old'))).resolves.toMatchObject({
      logoFileId: 'logos_new',
    });
  });

  it('rejects a file type that is not a logo before uploading anything', async () => {
    const file = new File(['nope'], 'notes.pdf', { type: 'application/pdf' });

    await expect(uploadLogo(file, profile())).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
    });

    expect(uploadAsset).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(removeAsset).not.toHaveBeenCalled();
  });
});

describe('saveProfile', () => {
  it('keeps the stored plan even when the input carries a different one', async () => {
    const stored: BusinessProfile = {
      ...profile(),
      plan: 'business',
      planExpiresAt: '2026-11-21T00:00:00.000Z',
    };
    getByOrg.mockResolvedValue(stored);
    save.mockImplementation(async ({ profile: next }: { profile: BusinessProfile }) => next);

    const saved = await saveProfile({ ...profile(), plan: 'free', planExpiresAt: null });

    expect(save).toHaveBeenCalledWith({
      orgId: ORG,
      profile: expect.objectContaining({
        plan: 'business',
        planExpiresAt: '2026-11-21T00:00:00.000Z',
      }),
    });
    expect(saved.plan).toBe('business');
  });

  it('starts a brand-new profile on the free plan', async () => {
    getByOrg.mockResolvedValue(null);
    save.mockImplementation(async ({ profile: next }: { profile: BusinessProfile }) => next);

    const saved = await saveProfile({ ...profile(), plan: 'business' });

    expect(save).toHaveBeenCalledWith({
      orgId: ORG,
      profile: expect.objectContaining({ plan: 'free', planExpiresAt: null }),
    });
    expect(saved.plan).toBe('free');
  });
});

describe('removeLogo', () => {
  it('persists the cleared id before deleting the file', async () => {
    save.mockResolvedValue(profile());

    const result = await removeLogo(profile('logos_old'));

    expect(result.logoFileId).toBeUndefined();
    expect(removeAsset).toHaveBeenCalledWith('logos_old');
    expect(save.mock.invocationCallOrder[0]!).toBeLessThan(
      removeAsset.mock.invocationCallOrder[0]!,
    );
  });

  it('does nothing when there is no logo', async () => {
    const result = await removeLogo(profile());

    expect(result.logoFileId).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(removeAsset).not.toHaveBeenCalled();
  });

  it('keeps the file when persisting the cleared id fails', async () => {
    save.mockRejectedValue(new AppError(ERROR_CODES.VALIDATION, 'Gagal menyimpan.'));

    await expect(removeLogo(profile('logos_old'))).rejects.toThrow();

    expect(removeAsset).not.toHaveBeenCalled();
  });
});
