import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, ERROR_CODES } from '../core/shared/errors';

const { createRecovery, completeRecovery, signOut } = vi.hoisted(() => ({
  createRecovery: vi.fn(),
  completeRecovery: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: { auth: { createRecovery, completeRecovery, signOut } },
}));

const {
  createRecovery: createRecoveryUseCase,
  completeRecovery: completeRecoveryUseCase,
  signOut: signOutUseCase,
} = await import('./auth');

beforeEach(() => {
  createRecovery.mockReset();
  completeRecovery.mockReset();
  signOut.mockReset();
});

describe('createRecovery', () => {
  it('trims the email before handing it to the repository', async () => {
    createRecovery.mockResolvedValue(undefined);

    await createRecoveryUseCase('  kamu@email.com ');

    expect(createRecovery).toHaveBeenCalledWith('kamu@email.com');
  });

  it('lets repository failures surface to the caller', async () => {
    createRecovery.mockRejectedValue(new Error('rate limited'));

    await expect(createRecoveryUseCase('kamu@email.com')).rejects.toThrow('rate limited');
  });
});

describe('completeRecovery', () => {
  it('forwards the emailed tokens and the new password unchanged', async () => {
    completeRecovery.mockResolvedValue(undefined);

    await completeRecoveryUseCase({
      userId: 'user-1',
      secret: 'secret-abc',
      password: 'rahasia123',
    });

    expect(completeRecovery).toHaveBeenCalledWith({
      userId: 'user-1',
      secret: 'secret-abc',
      password: 'rahasia123',
    });
  });

  it('lets an invalid or expired token failure surface to the caller', async () => {
    completeRecovery.mockRejectedValue(new Error('Tautan reset tidak valid atau sudah dipakai.'));

    await expect(
      completeRecoveryUseCase({ userId: 'u', secret: 's', password: 'p' }),
    ).rejects.toThrow('Tautan reset tidak valid atau sudah dipakai.');
  });
});

describe('signOut', () => {
  it('forgets the local session when the server says the session is already gone', async () => {
    // A blocked account (or one whose session was deleted elsewhere) cannot
    // end its own session server-side; the local logout must still proceed or
    // the user is stuck signed-in to a dead session.
    signOut.mockRejectedValue(new AppError(ERROR_CODES.UNAUTHENTICATED, 'gone'));

    await expect(signOutUseCase()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalled();
  });

  it('forgets the local session when the account is blocked (suspended)', async () => {
    signOut.mockRejectedValue(new AppError(ERROR_CODES.SUSPENDED, 'blocked'));

    await expect(signOutUseCase()).resolves.toBeUndefined();
  });

  it('surfaces a genuine network failure so the user can retry', async () => {
    signOut.mockRejectedValue(new AppError(ERROR_CODES.NETWORK, 'Tidak bisa terhubung.'));

    await expect(signOutUseCase()).rejects.toThrow('Tidak bisa terhubung.');
  });
});
