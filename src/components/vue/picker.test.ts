// @vitest-environment jsdom
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';
import { CE_EVENTS, pickEventSchema } from '../shared/contracts';
import type { CustomerOption, ProductOption } from '../shared/picker-options';
import './register';

const CUSTOMERS: CustomerOption[] = [
  {
    kind: 'customer',
    label: 'Budi',
    name: 'Budi',
    phone: '081234567890',
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    invoiceCount: 3,
  },
  {
    kind: 'customer',
    label: 'Siti',
    name: 'Siti',
    phone: '',
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

let host: HTMLElement & Record<string, unknown>;
const events: unknown[] = [];

async function mount(props: Record<string, unknown> = {}) {
  const node = document.createElement('notain-picker') as HTMLElement & Record<string, unknown>;
  node.customers = CUSTOMERS;
  node.products = PRODUCTS;
  node.label = 'Cari riwayat';
  node.placeholder = 'Ketik…';
  Object.assign(node, props);
  document.body.appendChild(node);
  await nextTick();
  host = node;
  host.addEventListener(CE_EVENTS.pick, (event: Event) => {
    events.push((event as CustomEvent).detail);
  });
  return node;
}

function input(): HTMLInputElement {
  return host.querySelector('[data-picker-input]') as HTMLInputElement;
}

function options(): HTMLElement[] {
  return [...host.querySelectorAll('[data-picker-option]')] as HTMLElement[];
}

async function focusInput() {
  input().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  await nextTick();
}

async function type(query: string) {
  const box = input();
  box.value = query;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function press(key: string) {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await nextTick();
}

beforeEach(async () => {
  document.body.innerHTML = '';
  events.length = 0;
  await mount();
  await focusInput();
});

describe('notain-picker', () => {
  it('renders the label and a combobox input', () => {
    expect(host.textContent).toContain('Cari riwayat');
    expect(input().getAttribute('role')).toBe('combobox');
    expect(input().getAttribute('aria-autocomplete')).toBe('list');
    expect(input().getAttribute('aria-controls')).toBe(
      host.querySelector('[data-picker-list]')?.id,
    );
  });

  it('lists customer history on focus', () => {
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toHaveLength(2);
    expect(options()[0]?.textContent).toContain('Budi');
    expect(options()[0]?.textContent).toContain('081234567890');
    expect(options()[1]?.textContent).toContain('Tanpa nomor');
  });

  it('filters options by the typed query', async () => {
    await type('sit');
    // The typed text is not on file verbatim, so the "add new" row trails the
    // match rather than replacing it.
    expect(options()).toHaveLength(2);
    expect(options()[0]?.textContent).toContain('Siti');
    expect(options()[1]?.textContent).toContain('Tambah');
  });

  it('does not offer to add a name that already exists verbatim', async () => {
    await type('budi');
    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain('Budi');
    expect(host.querySelector('[data-picker-option="create"]')).toBeNull();
  });

  it('offers to file a typed name that is not on the list', async () => {
    await type('zzzz');
    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain('Tambah');
    expect(options()[0]?.textContent).toContain('zzzz');
    expect(options()[0]?.getAttribute('data-picker-option')).toBe('create');
    // The empty hint is the fallback for product mode, where there is no
    // directory to add to; a customer always has somewhere to go.
    expect(host.querySelector('[data-picker-empty]')).toBeNull();
  });

  it('shows an empty message when nothing matches in product mode', async () => {
    await mount({ mode: 'product' });
    await focusInput();
    await type('zzzz');
    expect(options()).toHaveLength(0);
    expect(host.querySelector('[data-picker-empty]')?.textContent).toContain('Tidak ada');
  });

  it('emits a customer pick for the create row, carrying the typed name', async () => {
    await type('zzzz');
    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();

    expect(events).toHaveLength(1);
    const parsed = pickEventSchema.safeParse(events[0]);
    expect(parsed.success).toBe(true);
    expect(events[0]).toEqual({ kind: 'customer', name: 'zzzz', phone: '' });
  });

  it('reaches the create row with the arrow keys and files it on Enter', async () => {
    await type('zzzz');
    await press('ArrowDown');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');

    await press('Enter');
    expect(events.at(-1)).toEqual({ kind: 'customer', name: 'zzzz', phone: '' });
  });

  it('emits a validated customer pick and resets', async () => {
    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();

    expect(events).toHaveLength(1);
    const parsed = pickEventSchema.safeParse(events[0]);
    expect(parsed.success).toBe(true);
    expect(events[0]).toEqual({ kind: 'customer', name: 'Budi', phone: '081234567890' });
    expect(input().value).toBe('');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('emits a product pick with quantity 1 when mode is product', async () => {
    await mount({ mode: 'product' });
    await focusInput();

    expect(options()).toHaveLength(2);
    expect(options()[0]?.textContent).toContain('Kopi Susu');
    expect(options()[0]?.textContent).toContain('Rp18.000');

    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();
    expect(events.at(-1)).toEqual({
      kind: 'product',
      name: 'Kopi Susu',
      quantity: 1,
      unitPrice: 18_000,
    });
  });

  it('supports keyboard navigation and Enter to pick', async () => {
    await press('ArrowDown');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    await press('ArrowDown');
    expect(options()[1]?.getAttribute('aria-selected')).toBe('true');
    await press('ArrowUp');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');

    await press('Enter');
    expect(events.at(-1)).toEqual({ kind: 'customer', name: 'Budi', phone: '081234567890' });
  });

  it('closes on Escape and reopens on the next focus', async () => {
    await press('Escape');
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(options()).toHaveLength(0);

    await focusInput();
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });

  it('ignores Enter while the list is closed', async () => {
    await press('Escape');
    await press('Enter');
    expect(events).toHaveLength(0);
  });

  it('respects maxResults', async () => {
    await mount({ maxResults: 1 });
    await focusInput();
    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain('Budi');
  });
});
