import { describe, expect, it } from 'vite-plus/test';
import { EMPTY_ADJUSTMENT } from '../invoice/model';
import {
  attentionItems,
  chartStart,
  customRange,
  entryGrandTotal,
  financeFetchRange,
  monthRange,
  periodRange,
  recentActivity,
  revenueByMonth,
  summarizeFinance,
  weekRange,
  type InvoiceFinanceEntry,
} from './finance';

/** A fully-loaded entry builder — every metric test starts from this. */
function entry(over: Partial<InvoiceFinanceEntry> = {}): InvoiceFinanceEntry {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-001',
    customerName: 'Budi',
    status: null,
    date: '2026-10-10',
    items: [{ id: 'i1', name: 'Kopi', quantity: 2, unitPrice: 10_000 }],
    discount: EMPTY_ADJUSTMENT,
    tax: EMPTY_ADJUSTMENT,
    createdAt: '2026-10-10T08:00:00.000Z',
    ...over,
  };
}

describe('entryGrandTotal', () => {
  it('uses the shared invoice calculator (items + discount + tax)', () => {
    const total = entryGrandTotal(
      entry({
        items: [{ id: 'i1', name: 'A', quantity: 3, unitPrice: 1_000 }],
        discount: { type: 'percent', value: 10 },
        tax: { type: 'percent', value: 11 },
      }),
    );
    // 3000 − 10% = 2700; +11% = 2997.
    expect(total).toBe(2_997);
  });
});

describe('ranges', () => {
  it('weekRange runs Monday through today', () => {
    // 2026-10-19 is a Monday.
    expect(weekRange('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-19' });
    // 2026-10-21 is a Wednesday → Monday is the 19th.
    expect(weekRange('2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-21' });
    // 2026-10-25 is a Sunday → Monday is the 19th.
    expect(weekRange('2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('monthRange runs from the 1st through today', () => {
    expect(monthRange('2026-10-19')).toEqual({ from: '2026-10-01', to: '2026-10-19' });
  });

  it('customRange swaps a reversed pair and falls back on garbage', () => {
    expect(customRange('2026-10-05', '2026-10-01')).toEqual({
      from: '2026-10-01',
      to: '2026-10-05',
    });
    expect(customRange('', '2026-10-05', '2026-10-19')).toEqual({
      from: '2026-10-01',
      to: '2026-10-19',
    });
    expect(customRange('junk', '2026-10-05', '2026-10-19')).toEqual({
      from: '2026-10-01',
      to: '2026-10-19',
    });
  });

  it('periodRange dispatches to the right preset', () => {
    expect(periodRange('week', { from: '', to: '' }, '2026-10-21')).toEqual({
      from: '2026-10-19',
      to: '2026-10-21',
    });
    expect(periodRange('month', { from: '', to: '' }, '2026-10-21')).toEqual({
      from: '2026-10-01',
      to: '2026-10-21',
    });
    expect(periodRange('custom', { from: '2026-09-01', to: '2026-09-30' }, '2026-10-21')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('chartStart is the first of the month six months back (current included)', () => {
    expect(chartStart('2026-10-19')).toBe('2026-05-01');
    // Crossing a year boundary must not wrap into garbage.
    expect(chartStart('2026-02-10')).toBe('2025-09-01');
  });

  it('financeFetchRange widens the start for the chart and the end to today', () => {
    expect(financeFetchRange({ from: '2026-10-01', to: '2026-10-19' }, '2026-10-19')).toEqual({
      from: '2026-05-01',
      to: '2026-10-19',
    });
    // A custom range older than the chart wins the start, but the end still
    // reaches today so the chart's current month is never falsely empty.
    expect(financeFetchRange({ from: '2026-01-01', to: '2026-02-01' }, '2026-10-19')).toEqual({
      from: '2026-01-01',
      to: '2026-10-19',
    });
  });
});

describe('summarizeFinance', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };

  it('counts paid totals as revenue and excludes void from everything money', () => {
    const summary = summarizeFinance(
      [
        entry({ status: 'paid', date: '2026-10-05' }), // 20 000 received
        entry({ status: 'sent', date: '2026-10-06' }), // 20 000 outstanding
        entry({ status: 'void', date: '2026-10-07' }), // cancelled → no money anywhere
        entry({ status: null, date: '2026-10-08' }), // 20 000 outstanding
        entry({ status: 'paid', date: '2026-09-30' }), // outside period
      ],
      range,
    );

    expect(summary).toEqual({
      receivedRevenue: 20_000,
      unpaidAmount: 40_000,
      overdueCount: 0,
      overdueAmount: 0,
      invoiceCount: 4, // void included: it is activity, not money
    });
  });

  it('flags unpaid past-due invoices as overdue, never paid or void ones', () => {
    const summary = summarizeFinance(
      [
        entry({ status: 'sent', date: '2026-10-02', dueDate: '2026-10-10' }), // overdue
        entry({ status: 'paid', date: '2026-10-03', dueDate: '2026-10-10' }), // paid → not overdue
        entry({ status: 'void', date: '2026-10-04', dueDate: '2026-10-10' }), // void → not overdue
        entry({ status: 'sent', date: '2026-10-05', dueDate: '2026-12-01' }), // future due
        entry({ status: 'sent', date: '2026-10-06' }), // no due date → never overdue
      ],
      range,
    );

    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmount).toBe(20_000);
    expect(summary.receivedRevenue).toBe(20_000);
    expect(summary.unpaidAmount).toBe(60_000);
  });

  it('returns zeros for an empty period instead of NaN', () => {
    expect(summarizeFinance([], range)).toEqual({
      receivedRevenue: 0,
      unpaidAmount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      invoiceCount: 0,
    });
  });
});

describe('revenueByMonth', () => {
  it('buckets paid revenue across six months with zero-filled gaps', () => {
    const points = revenueByMonth(
      [
        entry({ status: 'paid', date: '2026-05-01' }), // first bucket
        entry({ status: 'paid', date: '2026-05-15' }), // same bucket
        entry({ status: 'paid', date: '2026-10-01' }), // current month
        entry({ status: 'sent', date: '2026-10-02' }), // unpaid → not revenue
        entry({ status: 'paid', date: '2026-04-30' }), // before window → dropped
      ],
      '2026-10-19',
    );

    expect(points).toHaveLength(6);
    expect(points.map((p) => p.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(points[0].revenue).toBe(40_000);
    expect(points[1].revenue).toBe(0);
    expect(points[5].revenue).toBe(20_000);
    expect(points[0].label).toBe('Mei');
  });
});

describe('attentionItems', () => {
  it('sorts overdue by most days first, then unpaid by recency, capped', () => {
    const items = attentionItems(
      [
        entry({ id: 'a', status: 'sent', date: '2026-10-01', dueDate: '2026-10-15' }), // 4 days late (now=19th)
        entry({ id: 'b', status: 'sent', date: '2026-10-02', dueDate: '2026-10-05' }), // 14 days late
        entry({ id: 'c', status: 'sent', date: '2026-10-09' }), // not overdue, newest
        entry({ id: 'd', status: null, date: '2026-10-03' }), // not overdue, older
        entry({ id: 'e', status: 'paid', date: '2026-10-04' }), // paid → excluded
        entry({ id: 'f', status: 'void', date: '2026-10-05' }), // void → excluded
      ],
      '2026-10-19',
    );

    expect(items.map((item) => item.entry.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(items[0].overdueDays).toBe(14);
    expect(items[1].overdueDays).toBe(4);
    expect(items[2].overdueDays).toBeNull();
  });

  it('honours the limit', () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      entry({ id: `x${index}`, status: 'sent', date: '2026-10-01' }),
    );
    expect(attentionItems(rows, '2026-10-19', 3)).toHaveLength(3);
  });
});

describe('recentActivity', () => {
  it('merges invoice, proof and customer events newest-first, capped', () => {
    const events = recentActivity(
      [
        {
          invoiceNumber: 'INV-1',
          customerName: 'Budi',
          createdAt: '2026-10-18T09:00:00.000Z',
          paymentProof: { key: 'proofs_x', uploadedAt: '2026-10-19T07:00:00.000Z' },
        },
        {
          invoiceNumber: 'INV-2',
          customerName: 'Siti',
          createdAt: '2026-10-17T09:00:00.000Z',
          paymentProof: null,
        },
      ],
      [{ name: 'Andi', createdAt: '2026-10-19T06:00:00.000Z' }],
    );

    expect(events.map((event) => event.kind)).toEqual([
      'payment-proof',
      'customer-created',
      'invoice-created',
      'invoice-created',
    ]);
  });

  it('drops everything past the cap', () => {
    const invoices = Array.from({ length: 20 }, (_, index) => ({
      invoiceNumber: `INV-${index}`,
      customerName: 'X',
      createdAt: `2026-10-${String((index % 28) + 1).padStart(2, '0')}T09:00:00.000Z`,
      paymentProof: null,
    }));
    expect(recentActivity(invoices, [])).toHaveLength(8);
  });
});
