import { useMemo, useState } from 'react';
import '../custom-elements';
import { calculateTotals } from '../../core/invoice/calculator';
import { createItemId, createPickedItem, EMPTY_ADJUSTMENT } from '../../core/invoice/model';
import type { InvoiceItem } from '../../core/invoice/model';
import { CE_EVENTS, itemsChangeEventSchema, pickEventSchema } from '../shared/contracts';
import type { PickPayload } from '../shared/contracts';
import type { CustomerOption, ProductOption } from '../shared/picker-options';
import { useCeProp, useCeRef } from '../shared/use-ce-element';
import { useCeEvent } from '../shared/use-ce-event';
import { CalcInspector } from './invoice/calc-inspector';
import { ItemsGrid } from './invoice/items-grid';
import { AppProviders } from './providers';
import { IslandBoundary } from './ui/island-boundary';

type Row = { id: string; name: string; quantity: number; unitPrice: number };

const ROWS: Row[] = [{ id: 'item-1', name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000 }];

// Local fixtures so this page stays Appwrite-free and deterministic — it is the
// Playwright target. Production wiring (useInvoices -> derivePickerOptions)
// lives in invoice/picker.tsx and is exercised by the invoice page itself.
const CUSTOMERS: CustomerOption[] = [
  {
    kind: 'customer',
    label: 'Budi Santoso',
    name: 'Budi Santoso',
    phone: '081234567890',
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    invoiceCount: 3,
  },
  {
    kind: 'customer',
    label: 'Siti Rahayu',
    name: 'Siti Rahayu',
    phone: '089876543210',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    invoiceCount: 1,
  },
];

const PRODUCTS: ProductOption[] = [
  {
    kind: 'product',
    label: 'Kopi Susu',
    name: 'Kopi Susu',
    unitPrice: 18_000,
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    invoiceCount: 2,
  },
  {
    kind: 'product',
    label: 'Teh Manis',
    name: 'Teh Manis',
    unitPrice: 12_000,
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    invoiceCount: 5,
  },
];

/**
 * Temporary harness that proves the cross-framework boundary end to end:
 * React pushes props into each island, each island emits a contract-shaped
 * CustomEvent, and React validates it before touching state. It also renders
 * the production widgets (grid, inspector) with local state so the whole
 * invoice form can be exercised without Appwrite.
 */
export function ProbeHost() {
  const [svelteRef, svelteEl] = useCeRef();
  const [vueRef, vueEl] = useCeRef();
  const [solidRef, solidEl] = useCeRef();
  const [customerPickerRef, customerPickerEl] = useCeRef();
  const [productPickerRef, productPickerEl] = useCeRef();
  const [log, setLog] = useState<string[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: createItemId(), name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000 },
  ]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });

  useCeProp(svelteEl, 'label', 'Svelte');
  useCeProp(svelteEl, 'rows', ROWS);
  useCeProp(vueEl, 'label', 'Vue');
  useCeProp(vueEl, 'rows', ROWS);
  useCeProp(solidEl, 'label', 'Solid');
  useCeProp(solidEl, 'rows', ROWS);

  useCeProp(customerPickerEl, 'mode', 'customer');
  useCeProp(customerPickerEl, 'label', 'Customer dari riwayat');
  useCeProp(customerPickerEl, 'customers', CUSTOMERS);
  useCeProp(productPickerEl, 'mode', 'product');
  useCeProp(productPickerEl, 'label', 'Barang dari riwayat');
  useCeProp(productPickerEl, 'products', PRODUCTS);

  const push = (line: string) => setLog((previous) => [line, ...previous].slice(0, 20));

  const onPick = (pick: PickPayload) => {
    push(`pick ${pick.kind}`);
    if (pick.kind === 'customer') {
      setCustomer({ name: pick.name, phone: pick.phone });
      return;
    }
    setItems((current) => [...current, createPickedItem(createItemId(), pick)]);
  };

  useCeEvent(svelteEl, CE_EVENTS.itemsChange, itemsChangeEventSchema, (payload) =>
    push(`svelte items ${payload.items.length}`),
  );
  useCeEvent(svelteEl, CE_EVENTS.pick, pickEventSchema, (payload) =>
    push(`svelte ${payload.kind}`),
  );
  useCeEvent(vueEl, CE_EVENTS.itemsChange, itemsChangeEventSchema, (payload) =>
    push(`vue items ${payload.items.length}`),
  );
  useCeEvent(vueEl, CE_EVENTS.pick, pickEventSchema, (payload) => push(`vue ${payload.kind}`));
  useCeEvent(solidEl, CE_EVENTS.itemsChange, itemsChangeEventSchema, (payload) =>
    push(`solid items ${payload.items.length}`),
  );
  useCeEvent(solidEl, CE_EVENTS.pick, pickEventSchema, (payload) => push(`solid ${payload.kind}`));
  useCeEvent(customerPickerEl, CE_EVENTS.pick, pickEventSchema, onPick);
  useCeEvent(productPickerEl, CE_EVENTS.pick, pickEventSchema, onPick);

  const totals = useMemo(
    () =>
      calculateTotals({
        items,
        discount: EMPTY_ADJUSTMENT,
        tax: EMPTY_ADJUSTMENT,
      }),
    [items],
  );

  return (
    <IslandBoundary>
      <AppProviders>
        <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
          <h1 className="text-xl font-semibold">Framework probes</h1>

          <div data-island="svelte" className="rounded-card border border-border bg-card p-4">
            <notain-probe-svelte ref={svelteRef} />
          </div>
          <div data-island="vue" className="rounded-card border border-border bg-card p-4">
            <notain-probe-vue ref={vueRef} />
          </div>
          <div data-island="solid" className="rounded-card border border-border bg-card p-4">
            <notain-probe-solid ref={solidRef} />
          </div>

          <section className="rounded-card border border-border bg-card p-4">
            <h2 className="mb-4 text-base font-semibold">Production widgets</h2>
            <div className="mb-6 flex flex-col gap-5">
              <notain-picker ref={customerPickerRef} data-customer-picker />
              <p className="text-sm text-muted">
                Terpilih: <span className="font-medium">{customer.name || '-'}</span>{' '}
                <span className="text-xs">{customer.phone}</span>
              </p>
            </div>
            <div className="mb-6">
              <notain-picker ref={productPickerRef} data-product-picker />
            </div>
            <ItemsGrid items={items} onChange={setItems} />
            <div className="mt-6">
              <CalcInspector totals={totals} />
            </div>
          </section>

          <ul data-probe-log className="flex flex-col gap-1 text-sm text-muted">
            {log.length === 0 ? <li>Belum ada event.</li> : null}
            {log.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      </AppProviders>
    </IslandBoundary>
  );
}
