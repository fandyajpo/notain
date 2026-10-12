import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRecovery, completeRecovery } = vi.hoisted(() => ({
  createRecovery: vi.fn(),
  completeRecovery: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: { auth: { createRecovery, completeRecovery } },
}));

const { createRecovery: createRecoveryUseCase, completeRecovery: completeRecoveryUseCase } =
  await import('./auth');

beforeEach(() => {
  createRecovery.mockReset();
  completeRecovery.mockReset();
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
