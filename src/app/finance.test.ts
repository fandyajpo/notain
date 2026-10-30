import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { SessionUser } from '../ports/auth-repository';
import { AppError } from '../core/shared/errors';
import { EMPTY_ADJUSTMENT } from '../core/invoice/model';
import type { InvoiceFinanceEntry } from '../core/stats/finance';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { listFinanceEntries, listRecentCreations } = vi.hoisted(() => ({
  listFinanceEntries: vi.fn(),
  listRecentCreations: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    invoices: { listFinanceEntries },
    customers: { listRecentCreations },
  },
}));

const { getDashboardFinance } = await import('./finance');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

function entry(over: Partial<InvoiceFinanceEntry> = {}): InvoiceFinanceEntry {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-001',
    customerName: 'Budi',
    status: 'paid',
    date: '2026-10-10',
    items: [{ id: 'i1', name: 'Kopi', quantity: 1, unitPrice: 5_000 }],
    discount: EMPTY_ADJUSTMENT,
    tax: EMPTY_ADJUSTMENT,
    createdAt: '2026-10-10T08:00:00.000Z',
    paymentProof: null,
    ...over,
  };
}

const NOW = '2026-10-19';

beforeEach(() => {
  forgetSession();
  getSession.mockReset();
  listFinanceEntries.mockReset();
  listRecentCreations.mockReset();

  getSession.mockResolvedValue(ALICE);
  listFinanceEntries.mockResolvedValue([]);
  listRecentCreations.mockResolvedValue([]);
});

describe('getDashboardFinance', () => {
  it('computes every metric from one windowed walk plus one customer read', async () => {
    listFinanceEntries.mockResolvedValue([
      entry({ id: 'a', status: 'paid', date: '2026-10-05' }), // 5 000 revenue
      entry({ id: 'b', status: 'sent', date: '2026-10-06', dueDate: '2026-10-10' }), // overdue
      entry({ id: 'c', status: 'void', date: '2026-10-07' }), // excluded from money
    ]);
    listRecentCreations.mockResolvedValue([
      { name: 'Siti', createdAt: '2026-10-18T02:00:00.000Z' },
    ]);

    const finance = await getDashboardFinance({
      range: { from: '2026-10-01', to: '2026-10-19' },
      now: NOW,
    });

    expect(finance.summary).toMatchObject({
      receivedRevenue: 5_000,
      unpaidAmount: 5_000,
      overdueCount: 1,
      invoiceCount: 3,
    });
    expect(finance.attention).toHaveLength(1);
    // Newest first: the Oct 18 customer creation outranks the Oct 10 invoice.
    expect(finance.activity[0]).toMatchObject({ kind: 'customer-created', customerName: 'Siti' });
    expect(finance.truncated).toBe(false);

    // The window widens to the chart start (2026-05-01) but keeps the period end.
    expect(listFinanceEntries).toHaveBeenCalledTimes(1);
    expect(listFinanceEntries).toHaveBeenCalledWith(
      'user-a',
      expect.objectContaining({ from: '2026-05-01', to: '2026-10-19' }),
    );
    expect(listRecentCreations).toHaveBeenCalledTimes(1);
  });

  it('walks additional pages until a partial page ends the walk', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      entry({ id: `row-${index}`, date: '2026-10-01' }),
    );
    listFinanceEntries
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([entry({ id: 'last' })]);

    const finance = await getDashboardFinance({
      range: { from: '2026-10-01', to: '2026-10-19' },
      now: NOW,
    });

    expect(listFinanceEntries).toHaveBeenCalledTimes(2);
    // The cursor rides the last row's id.
    expect(listFinanceEntries.mock.calls[1]?.[1]?.cursorAfter).toBe('row-99');
    expect(finance.summary.invoiceCount).toBe(101);
    expect(finance.truncated).toBe(false);
  });

  it('flags truncation instead of silently under-reporting', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      entry({ id: `row-${index}`, date: '2026-10-01' }),
    );
    // 20 full pages and still going → the walk stops at the cap.
    listFinanceEntries.mockResolvedValue(fullPage);

    const finance = await getDashboardFinance({
      range: { from: '2026-10-01', to: '2026-10-19' },
      now: NOW,
    });

    expect(listFinanceEntries).toHaveBeenCalledTimes(20);
    expect(finance.truncated).toBe(true);
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(
      getDashboardFinance({ range: { from: '2026-10-01', to: '2026-10-19' }, now: NOW }),
    ).rejects.toBeInstanceOf(AppError);
    expect(listFinanceEntries).not.toHaveBeenCalled();
    expect(listRecentCreations).not.toHaveBeenCalled();
  });
});
