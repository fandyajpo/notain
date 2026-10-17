// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CE_EVENTS, itemsChangeEventSchema, type ItemsChangePayload } from '../shared/contracts';
import './register';

type Row = { id: string; name: string; quantity: number; unitPrice: number };

const ROWS: Row[] = [
  { id: 'item-1', name: 'Nasi Goreng', quantity: 2, unitPrice: 25_000 },
  { id: 'item-2', name: 'Es Teh', quantity: 1, unitPrice: 5_000 },
];

let host: HTMLElement;

async function mount(items: Row[], props: Record<string, unknown> = {}) {
  host = document.createElement('notain-items-grid');
  Object.assign(host, { items, maxItems: 100, errorMessage: '', ...props });
  document.body.appendChild(host);
  await tick();
  return host;
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

function capturedEvents(): ItemsChangePayload[] {
  const raw = (host as unknown as { __events?: ItemsChangePayload[] }).__events ?? [];
  return raw;
}

function listen() {
  const seen: ItemsChangePayload[] = [];
  host.addEventListener(CE_EVENTS.itemsChange, (event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    const parsed = itemsChangeEventSchema.safeParse(detail);
    if (parsed.success) seen.push(parsed.data);
  });
  (host as unknown as { __events?: ItemsChangePayload[] }).__events = seen;
}

const INPUT_LABELS = {
  name: 'Nama barang',
  quantity: 'Jumlah',
  unit: 'Satuan',
  unitPrice: 'Harga satuan dalam rupiah',
} as const;

function inputAt(row: number, field: keyof typeof INPUT_LABELS): HTMLInputElement {
  const label = INPUT_LABELS[field];
  const rows = host.querySelectorAll('tbody tr');
  const node = rows[row]?.querySelector(`input[aria-label="${label}"]`);
  expect(node, `input ${field} on row ${row}`).toBeTruthy();
  return node as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function button(label: string): HTMLButtonElement {
  const node = [...host.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === label,
  );
  expect(node, `button ${label}`).toBeTruthy();
  return node as HTMLButtonElement;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  await mount(ROWS);
  listen();
});

describe('notain-items-grid', () => {
  it('renders one row per item with a formatted subtotal', () => {
    expect(host.querySelectorAll('tbody tr[data-item-row]')).toHaveLength(2);
    const subtotals = [...host.querySelectorAll('[data-item-subtotal]')].map(
      (node) => node.textContent?.trim() ?? '',
    );
    expect(subtotals[0]).toBe('Rp50.000');
    expect(subtotals[1]).toBe('Rp5.000');
  });

  it('shows the empty state when there are no items', async () => {
    await mount([]);
    expect(host.textContent).toContain('Belum ada barang');
    expect(host.querySelector('[data-add-item]')).toBeTruthy();
  });

  it('emits the full list when a name changes', async () => {
    type(inputAt(1, 'name'), 'Es Jeruk');
    const last = capturedEvents().at(-1);
    expect(last?.items.map((item) => item.name)).toEqual(['Nasi Goreng', 'Es Jeruk']);
  });

  it('emits a parsed unit price', async () => {
    type(inputAt(0, 'unitPrice'), '30.000');
    expect(capturedEvents().at(-1)?.items[0]?.unitPrice).toBe(30_000);
  });

  it('emits a typed unit and drops it again when the field is cleared', async () => {
    type(inputAt(0, 'unit'), 'liter');
    expect(capturedEvents().at(-1)?.items[0]?.unit).toBe('liter');

    type(inputAt(0, 'unit'), '');
    expect(capturedEvents().at(-1)?.items[0]?.unit).toBeUndefined();
  });

  it('shows the unit a seeded row already carries', async () => {
    await mount([{ ...ROWS[0], unit: 'pcs' }, ROWS[1]] as Row[]);

    const input = host.querySelector('input[aria-label="Satuan"]') as HTMLInputElement;
    expect(input.value).toBe('pcs');
  });

  it('always offers the unit field, even on rows that have none', () => {
    const inputs = host.querySelectorAll('input[aria-label="Satuan"]');
    expect(inputs).toHaveLength(ROWS.length);
    expect((inputs[0] as HTMLInputElement).value).toBe('');
  });

  it('never emits a quantity below one', async () => {
    type(inputAt(0, 'quantity'), '0');
    expect(capturedEvents().at(-1)?.items[0]?.quantity).toBe(1);
  });

  it('appends a new row from the in-grid add button', async () => {
    host.querySelector<HTMLElement>('[data-add-item]')?.click();
    const last = capturedEvents().at(-1);
    expect(last?.items).toHaveLength(3);
    expect(last?.items[2]).toEqual({ id: expect.any(String), name: '', quantity: 1, unitPrice: 0 });
  });

  it('hides the add button once the limit is reached', async () => {
    await mount(ROWS, { maxItems: 2 });
    expect(host.querySelector('[data-add-item]')).toBeNull();
  });

  it('removes a row', async () => {
    button('Hapus Es Teh').click();
    expect(
      capturedEvents()
        .at(-1)
        ?.items.map((item) => item.id),
    ).toEqual(['item-1']);
  });

  it('moves a row down and back up', async () => {
    button('Turunkan Nasi Goreng').click();
    expect(
      capturedEvents()
        .at(-1)
        ?.items.map((item) => item.id),
    ).toEqual(['item-2', 'item-1']);

    await mount(capturedEvents().at(-1)?.items ?? []);
    listen();
    button('Naikkan Nasi Goreng').click();
    expect(
      capturedEvents()
        .at(-1)
        ?.items.map((item) => item.id),
    ).toEqual(['item-1', 'item-2']);
  });

  it('disables the reorder buttons at the ends', () => {
    expect(button('Naikkan Nasi Goreng').disabled).toBe(true);
    expect(button('Turunkan Nasi Goreng').disabled).toBe(false);
    expect(button('Turunkan Es Teh').disabled).toBe(true);
  });

  it('surfaces the form-level error message', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(ROWS, { errorMessage: 'Tambahkan minimal satu item ke invoice.' });
    expect(host.textContent).toContain('Tambahkan minimal satu item ke invoice.');
    warn.mockRestore();
  });

  it('rejects a malformed itemschange payload', () => {
    const bad = document.createElement('div');
    bad.dispatchEvent(new CustomEvent(CE_EVENTS.itemsChange, { detail: { items: 'nope' } }));
    expect(itemsChangeEventSchema.safeParse({ items: 'nope' }).success).toBe(false);
  });
});
