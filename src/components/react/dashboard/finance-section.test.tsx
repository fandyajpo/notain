// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { FinanceSection } from './finance-section';
import type { DashboardFinance } from '../../../app/finance';
import { EMPTY_ADJUSTMENT } from '../../../core/invoice/model';

const { getDashboardFinance } = vi.hoisted(() => ({ getDashboardFinance: vi.fn() }));

vi.mock('../../../app/finance', () => ({ getDashboardFinance }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

function finance(over: Partial<DashboardFinance> = {}): DashboardFinance {
  return {
    range: { from: '2026-10-01', to: '2026-10-19' },
    summary: {
      receivedRevenue: 150_000,
      unpaidAmount: 40_000,
      overdueCount: 1,
      overdueAmount: 20_000,
      invoiceCount: 5,
    },
    chart: [
      { month: '2026-05', label: 'Mei', revenue: 0 },
      { month: '2026-06', label: 'Jun', revenue: 10_000 },
      { month: '2026-07', label: 'Jul', revenue: 0 },
      { month: '2026-08', label: 'Agu', revenue: 0 },
      { month: '2026-09', label: 'Sep', revenue: 0 },
      { month: '2026-10', label: 'Okt', revenue: 140_000 },
    ],
    attention: [
      {
        entry: {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-001',
          customerName: 'Budi',
          customerPhone: '081234567890',
          status: 'sent',
          date: '2026-10-01',
          dueDate: '2026-10-10',
          items: [{ id: 'i1', name: 'Kopi', quantity: 2, unitPrice: 10_000 }],
          discount: EMPTY_ADJUSTMENT,
          tax: EMPTY_ADJUSTMENT,
          createdAt: '2026-10-01T08:00:00.000Z',
          paymentProof: null,
        },
        total: 20_000,
        overdueDays: 9,
      },
      {
        entry: {
          id: 'inv-2',
          invoiceNumber: 'INV-2026-002',
          customerName: 'Siti',
          // No phone: the WhatsApp action must not render for this row.
          customerPhone: undefined,
          status: null,
          date: '2026-10-05',
          items: [{ id: 'i2', name: 'Teh', quantity: 1, unitPrice: 5_000 }],
          discount: EMPTY_ADJUSTMENT,
          tax: EMPTY_ADJUSTMENT,
          createdAt: '2026-10-05T08:00:00.000Z',
          paymentProof: null,
        },
        total: 5_000,
        overdueDays: null,
      },
    ],
    activity: [
      {
        kind: 'invoice-created',
        at: '2026-10-18T09:00:00.000Z',
        invoiceNumber: 'INV-2026-002',
        customerName: 'Siti',
      },
      {
        kind: 'customer-created',
        at: '2026-10-17T09:00:00.000Z',
        customerName: 'Andi',
      },
    ],
    truncated: false,
    ...over,
  };
}

async function render(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  // Drive the query to settlement: each turn lets the mocked promise resolve
  // and react-query schedule its state update.
  for (let turn = 0; turn < 10; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  getDashboardFinance.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('FinanceSection', () => {
  it('renders the four money cards with distinct money vs count shapes', async () => {
    getDashboardFinance.mockResolvedValue(finance());

    await render(<FinanceSection businessName="Warung Maju" />);

    expect(container.textContent).toContain('Pendapatan diterima');
    expect(container.textContent).toContain('Rp150.000');
    expect(container.textContent).toContain('Belum dibayar');
    expect(container.textContent).toContain('Rp40.000');
    expect(container.textContent).toContain('Jatuh tempo lewat');
    expect(container.textContent).toContain('1 invoice');
    expect(container.textContent).toContain('Invoice dibuat');
  });

  it('draws six chart bars with a screen-reader summary', async () => {
    getDashboardFinance.mockResolvedValue(finance());

    await render(<FinanceSection businessName="Warung Maju" />);

    const chart = container.querySelector('[role="img"]');
    expect(chart).not.toBeNull();
    expect(chart?.getAttribute('aria-label')).toContain('Okt Rp140.000');
    // Six month columns, one per bucket.
    expect(chart?.querySelectorAll('.bg-accent\\/80, .bg-border\\/60').length).toBe(6);
  });

  it('offers a WhatsApp reminder only when the invoice has a phone number', async () => {
    getDashboardFinance.mockResolvedValue(finance());

    await render(<FinanceSection businessName="Warung Maju" />);

    const waLinks = [...container.querySelectorAll('a[href^="https://wa.me/"]')];
    expect(waLinks).toHaveLength(1);
    expect(decodeURIComponent(waLinks[0].getAttribute('href') ?? '')).toContain('INV-2026-001');
    expect(container.textContent).toContain('Terlambat 9 hari');
  });

  it('lists recent activity newest first', async () => {
    getDashboardFinance.mockResolvedValue(finance());

    await render(<FinanceSection businessName="Warung Maju" />);

    const activity = container.querySelector('[data-tour="dash-activity"]');
    expect(activity?.textContent).toContain('INV-2026-002 dibuat untuk Siti');
    expect(activity?.textContent).toContain('Customer Andi ditambahkan');
    const rows = activity?.querySelectorAll('li') ?? [];
    expect(rows[0]?.textContent).toContain('INV-2026-002');
  });

  it('surfaces the truncation warning instead of silently under-reporting', async () => {
    getDashboardFinance.mockResolvedValue(finance({ truncated: true }));

    await render(<FinanceSection businessName="Warung Maju" />);

    expect(container.textContent).toContain('mungkin belum lengkap');
  });

  it('offers a retry when the finance query fails', async () => {
    getDashboardFinance.mockRejectedValue(new Error('network down'));

    await render(<FinanceSection businessName="Warung Maju" />);

    expect(container.textContent).toContain('Gagal memuat keuangan');
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Coba lagi',
    );
    expect(retry).toBeDefined();
  });

  it('hides the attention section when nothing is unpaid', async () => {
    getDashboardFinance.mockResolvedValue(finance({ attention: [] }));

    await render(<FinanceSection businessName="Warung Maju" />);

    expect(container.querySelector('[data-tour="dash-attention"]')).toBeNull();
    expect(container.textContent).toContain('Pendapatan diterima');
  });
});
