// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createEmptyDraft, type Invoice } from '../../../core/invoice/model';
import type { InvoicePage } from '../../../ports/invoice-repository';
import { queryKeys } from '../keys';
import { useInvoices, useUpdateInvoiceStatus } from './use-invoices';

/**
 * The two cache behaviours the tables depend on, exercised end-to-end against
 * a real QueryClient (the app layer is mocked, the cache logic is not):
 *
 * 1. **Optimistic rollback** — a status flip paints instantly and the
 *    snapshot is restored when the server rejects it. Nothing else in the
 *    suite covered the `onError` path of the optimistic mutations.
 * 2. **`keepPreviousData`** — changing the search key keeps the previous
 *    rows on screen (`isPlaceholderData` true, `isPending` false, which is
 *    what stops the full-card spinner) until the new page lands.
 */

const { listInvoicesPage, updateInvoiceStatus } = vi.hoisted(() => ({
  listInvoicesPage: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));

vi.mock('../../../app/invoices', () => ({
  createInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  deleteInvoices: vi.fn(),
  getInvoice: vi.fn(),
  listAllInvoiceNumbers: vi.fn(),
  listPickerHistory: vi.fn(),
  listInvoicesPage,
  updateInvoice: vi.fn(),
  updateInvoiceStatus,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type InfiniteData = { pages: InvoicePage[]; pageParams: Array<string | undefined> };

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    ...createEmptyDraft('INV-2026-001', '2026-10-01'),
    id: 'inv-1',
    ownerId: 'user-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    customerName: 'Budi Santoso',
    ...over,
  };
}

function page(items: Invoice[]): InvoicePage {
  return { items, nextCursor: null, total: items.length };
}

function seededList(items: Invoice[]): InfiniteData {
  return { pages: [page(items)], pageParams: [undefined] };
}

/** First cached invoice's status under the unfiltered key, or `undefined`. */
function readStatus(): string | null | undefined {
  const data = queryClient.getQueryData<InfiniteData>(queryKeys.invoices(''));
  return data?.pages[0]?.items[0]?.status;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Waits for an assertion to hold, flushing React and a real timer tick on
 * every attempt. A query's resolution travels through TanStack's notify
 * queue and React's scheduler (a macrotask in jsdom), so a *fixed* flush is
 * a coin flip under parallel test load — the wait is a condition, not a
 * duration, and a genuinely wrong expectation still fails once the bound is
 * spent (the final attempt rethrows the real mismatch).
 */
async function until(assertion: () => void, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      });
    }
  }
  assertion();
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render(ui: ReactNode): void {
  act(() => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
}

function probe(): HTMLElement {
  const node = container.querySelector('[data-probe]');
  expect(node, 'expected the probe to render').toBeTruthy();
  return node as HTMLElement;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // The app's own client pins mutations to no-retry; without this a
      // rejected mutation would be replayed three times and drag the test
      // through TanStack's backoff delays.
      mutations: { retry: false },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

function FlipButton() {
  const flip = useUpdateInvoiceStatus();
  return (
    <button
      type="button"
      data-flip
      disabled={flip.isPending}
      onClick={() => flip.mutate({ id: 'inv-1', status: 'sent' })}
    >
      flip
    </button>
  );
}

function ListProbe({ search }: { search: string }) {
  const query = useInvoices(search);
  const rows = query.data?.pages.flatMap((pageEntry) => pageEntry.items) ?? [];
  return (
    <div
      data-probe
      data-pending={String(query.isPending)}
      data-placeholder={String(query.isPlaceholderData)}
      data-first={rows[0]?.id ?? ''}
    />
  );
}

describe('useUpdateInvoiceStatus — optimistic write', () => {
  it('paints the flip immediately and restores the snapshot when the server rejects it', async () => {
    queryClient.setQueryData(queryKeys.invoices(''), seededList([invoice()]));
    render(<FlipButton />);

    // Hang the request so both phases are observable: while in flight the
    // cache must already show the pick…
    const inFlight = deferred<Invoice>();
    updateInvoiceStatus.mockReturnValue(inFlight.promise);
    await act(async () => {
      (container.querySelector('[data-flip]') as HTMLButtonElement).click();
    });
    await until(() => expect(readStatus()).toBe('sent'));

    // …and when the server refuses, the pre-mutation snapshot comes back —
    // a rollback failure here would leave the UI claiming a status the
    // database never accepted.
    await act(async () => {
      inFlight.reject(new Error('server said no'));
    });
    await until(() => expect(readStatus()).toBeNull());
  });

  it('keeps the flip after a successful settle (server is source of truth)', async () => {
    queryClient.setQueryData(queryKeys.invoices(''), seededList([invoice()]));
    render(<FlipButton />);

    updateInvoiceStatus.mockResolvedValue(invoice({ status: 'sent' }));
    await act(async () => {
      (container.querySelector('[data-flip]') as HTMLButtonElement).click();
    });
    await until(() => expect(readStatus()).toBe('sent'));
  });
});

describe('useInvoices — keepPreviousData across a search change', () => {
  it('holds the previous rows on screen while the new key loads, then swaps', async () => {
    queryClient.setQueryData(queryKeys.invoices(''), seededList([invoice()]));
    render(<ListProbe search="" />);

    // Fresh seeded cache: first visit shows the row without any fetch.
    await until(() => {
      expect(probe().dataset.pending).toBe('false');
      expect(probe().dataset.first).toBe('inv-1');
    });

    // The debounced search lands: new key starts loading. Without
    // keepPreviousData `isPending` would flip to true (the full-card spinner
    // condition) and the rows would vanish mid-keystroke.
    const next = deferred<InvoicePage>();
    listInvoicesPage.mockReturnValueOnce(next.promise);
    render(<ListProbe search="budi" />);
    await until(() => {
      expect(probe().dataset.placeholder).toBe('true');
      expect(probe().dataset.pending).toBe('false');
      expect(probe().dataset.first).toBe('inv-1');
    });

    // The real answer lands and replaces the placeholder.
    next.resolve(page([invoice({ id: 'inv-2', invoiceNumber: 'INV-2026-002' })]));
    await until(() => {
      expect(probe().dataset.placeholder).toBe('false');
      expect(probe().dataset.first).toBe('inv-2');
    });
  });

  it('still shows a plain loading state when there is nothing to fall back to', async () => {
    // No seeded cache: a first-ever visit must not invent rows.
    const first = deferred<InvoicePage>();
    listInvoicesPage.mockReturnValueOnce(first.promise);
    render(<ListProbe search="" />);
    await until(() => {
      expect(probe().dataset.pending).toBe('true');
      expect(probe().dataset.placeholder).toBe('false');
      expect(probe().dataset.first).toBe('');
    });

    first.resolve(page([invoice()]));
    await until(() => expect(probe().dataset.first).toBe('inv-1'));
  });
});
