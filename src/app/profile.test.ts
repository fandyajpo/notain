import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';
import type { BusinessProfile } from '../core/profile/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { getByOwner, save } = vi.hoisted(() => ({ getByOwner: vi.fn(), save: vi.fn() }));
const { uploadAsset, removeAsset, viewUrl } = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  removeAsset: vi.fn(),
  viewUrl: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    profiles: { getByOwner, save },
    assets: { uploadLogo: uploadAsset, remove: removeAsset, viewUrl },
  },
}));

const { removeLogo, uploadLogo } = await import('./profile');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

function logoFile(): File {
  return new File(['png-bytes'], 'logo.png', { type: 'image/png' });
}

function profile(logoFileId?: string): BusinessProfile {
  return {
    name: 'Bengkel Fa',
    businessName: 'Bengkel Fa',
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
  getByOwner.mockReset();
  save.mockReset();
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
      ownerId: ALICE.id,
      profile: expect.objectContaining({ logoFileId: 'logos_new' }),
    });
    // The row must already point at the new file before the old one goes —
    // deleting first would break the invoice header if the save failed.
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(removeAsset.mock.invocationCallOrder[0]);
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

describe('removeLogo', () => {
  it('persists the cleared id before deleting the file', async () => {
    save.mockResolvedValue(profile());

    const result = await removeLogo(profile('logos_old'));

    expect(result.logoFileId).toBeUndefined();
    expect(removeAsset).toHaveBeenCalledWith('logos_old');
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(removeAsset.mock.invocationCallOrder[0]);
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
