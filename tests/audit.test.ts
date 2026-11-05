import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { writeAudit } from '../functions/_lib/audit';
import type { Env } from '../functions/_lib/types';

const entry = {
  actorId: 'admin-1',
  actorEmail: 'admin@example.com',
  action: 'user.update',
  targetType: 'user',
  targetId: 'user-2',
};

const configuredEnv = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('writeAudit', () => {
  it('returns false and logs when Appwrite is not configured', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(writeAudit({} as Env, entry)).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('returns false for an upstream failure without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );

    await expect(writeAudit(configuredEnv, entry)).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it('returns true when the audit document is written', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 201 })),
    );

    await expect(writeAudit(configuredEnv, entry)).resolves.toBe(true);
  });
});
