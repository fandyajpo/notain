import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';
import type { DashboardStats } from '../core/stats/model';
import { AppError } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { findByOwner, create, update, countByOwner } = vi.hoisted(() => ({
  findByOwner: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  countByOwner: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    stats: { findByOwner, create, update },
    templates: { countByOwner },
  },
}));

const { listInvoicesPage } = vi.hoisted(() => ({ listInvoicesPage: vi.fn() }));
vi.mock('./invoices', () => ({ listInvoicesPage }));

const { countCustomers } = vi.hoisted(() => ({ countCustomers: vi.fn() }));
vi.mock('./customers', () => ({ countCustomers }));

const { getDashboardStats, refreshDashboardStats } = await import('./stats');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

const COUNTS = {
  totalInvoices: 12,
  sentCount: 5,
  paidCount: 4,
  voidCount: 1,
  totalCustomers: 7,
  totalTemplates: 3,
};

const stored = (over: Partial<DashboardStats> = {}): DashboardStats => ({
  id: 'stats-1',
  ownerId: 'user-a',
  ...COUNTS,
  updatedAt: '2026-10-11T08:30:00.000Z',
  ...over,
});

beforeEach(() => {
  // `session.ts` memoizes the user across tests; a stale cache would leak the
  // previous account into the "requires a session" cases.
  forgetSession();
  getSession.mockReset();
  findByOwner.mockReset();
  create.mockReset();
  update.mockReset();
  countByOwner.mockReset();
  listInvoicesPage.mockReset();
  countCustomers.mockReset();

  getSession.mockResolvedValue(ALICE);
  listInvoicesPage.mockImplementation(async ({ status }: { status?: string }) => ({
    total: status === 'sent' ? 5 : status === 'paid' ? 4 : status === 'void' ? 1 : 12,
  }));
  countCustomers.mockResolvedValue(7);
  countByOwner.mockResolvedValue(3);
});

describe('getDashboardStats', () => {
  it('returns the owner’s cached row', async () => {
    findByOwner.mockResolvedValue(stored());

    await expect(getDashboardStats()).resolves.toEqual(stored());
    expect(findByOwner).toHaveBeenCalledWith('user-a');
  });

  it('returns null before the first refresh — the row simply does not exist yet', async () => {
    findByOwner.mockResolvedValue(null);

    await expect(getDashboardStats()).resolves.toBeNull();
  });

  it('returns null without a session instead of throwing at the caller', async () => {
    getSession.mockResolvedValue(null);

    await expect(getDashboardStats()).resolves.toBeNull();
    expect(findByOwner).not.toHaveBeenCalled();
  });

  it('returns null when the read fails — a missing stats table must not break the dashboard', async () => {
    // `stats:ensure` has not been run in this environment: the collection is
    // missing and the read 404s. The UI degrades to "no cache yet".
    findByOwner.mockRejectedValue(new Error('Collection not found'));

    await expect(getDashboardStats()).resolves.toBeNull();
  });
});

describe('refreshDashboardStats', () => {
  it('recomputes every counter from the source tables and creates the row', async () => {
    findByOwner.mockResolvedValue(null);
    create.mockImplementation(async ({ ownerId, counts }: { ownerId: string; counts: typeof COUNTS }) => ({
      id: 'stats-1',
      ownerId,
      ...counts,
      updatedAt: '2026-10-11T09:00:00.000Z',
    }));

    await expect(refreshDashboardStats()).resolves.toEqual(stored({ updatedAt: '2026-10-11T09:00:00.000Z' }));

    // One count per state plus the overall total — each a limit-1 read.
    expect(listInvoicesPage).toHaveBeenCalledWith({ status: 'sent', limit: 1 });
    expect(listInvoicesPage).toHaveBeenCalledWith({ status: 'paid', limit: 1 });
    expect(listInvoicesPage).toHaveBeenCalledWith({ status: 'void', limit: 1 });
    expect(listInvoicesPage).toHaveBeenCalledWith({ limit: 1 });
    expect(listInvoicesPage).toHaveBeenCalledTimes(4);
    expect(countCustomers).toHaveBeenCalledTimes(1);
    expect(countByOwner).toHaveBeenCalledWith('user-a');

    expect(create).toHaveBeenCalledWith({ ownerId: 'user-a', counts: COUNTS });
    expect(update).not.toHaveBeenCalled();
  });

  it('writes the recomputed counters back into the existing row', async () => {
    findByOwner.mockResolvedValue(stored());
    update.mockImplementation(async ({ id, counts }: { id: string; counts: typeof COUNTS }) => ({
      id,
      ownerId: 'user-a',
      ...counts,
      updatedAt: '2026-10-11T09:00:00.000Z',
    }));

    await expect(refreshDashboardStats()).resolves.toEqual(
      stored({ updatedAt: '2026-10-11T09:00:00.000Z' }),
    );

    expect(update).toHaveBeenCalledWith({ id: 'stats-1', counts: COUNTS });
    expect(create).not.toHaveBeenCalled();
  });

  it('still returns fresh numbers when the stats table is missing', async () => {
    // Persistence fails (collection absent), but the recomputation succeeded —
    // the dashboard shows live numbers exactly as it did before the cache.
    findByOwner.mockRejectedValue(new Error('Collection not found'));

    const stats = await refreshDashboardStats();

    expect(stats).toMatchObject({ id: '', ownerId: 'user-a', ...COUNTS });
    expect(stats.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('still returns fresh numbers when the write-back fails', async () => {
    findByOwner.mockResolvedValue(stored());
    update.mockRejectedValue(new Error('write denied'));

    const stats = await refreshDashboardStats();

    expect(stats).toMatchObject({ id: '', ownerId: 'user-a', ...COUNTS });
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(refreshDashboardStats()).rejects.toBeInstanceOf(AppError);
    expect(listInvoicesPage).not.toHaveBeenCalled();
  });
});
