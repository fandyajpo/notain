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
    email: 'budi@email.test',
    phone: '081234567890',
    lastUsedAt: '2026-01-02T00:00:00.000Z',
    invoiceCount: 3,
  },
  {
    kind: 'customer',
    label: 'Siti',
    name: 'Siti',
    email: '',
    phone: '',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    invoiceCount: 1,
  },
  {
    kind: 'customer',
    label: 'Toko Maju',
    name: 'Toko Maju',
    email: 'halo@tokomaju.test',
    phone: '',
    lastUsedAt: '2025-12-30T00:00:00.000Z',
    invoiceCount: 2,
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
    const box = input();
    expect(host.querySelector('label')?.textContent).toContain('Cari riwayat');
    expect(box.getAttribute('role')).toBe('combobox');
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    expect(box.getAttribute('placeholder')).toBe('Ketik…');
  });

  it('lists customer history on focus', () => {
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toHaveLength(3);
    expect(options()[0]?.textContent).toContain('Budi');
    expect(options()[0]?.textContent).toContain('081234567890');
  });

  it('shows the phone, then the email, then a fallback as the row meta', () => {
    // Budi has both: the phone is the WhatsApp number, so it leads.
    expect(options()[0]?.textContent).toContain('081234567890');
    // Toko Maju has an email but no phone.
    expect(options()[2]?.textContent).toContain('halo@tokomaju.test');
    // Siti has neither.
    expect(options()[1]?.textContent).toContain('Tanpa kontak');
  });

  it('filters options by the typed query', async () => {
    await type('sit');
    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain('Siti');
  });

  it('shows an empty message when nothing matches', async () => {
    await type('zzzz');
    expect(options()).toHaveLength(0);
    expect(host.querySelector('[data-picker-empty]')?.textContent).toContain('Tidak ada');
  });

  it('never offers to create a row from the typed text', async () => {
    await type('zzzz');
    expect(host.querySelector('[data-picker-option="create"]')).toBeNull();
    expect(host.querySelector('[data-picker-empty]')?.textContent).toContain('Tidak ada');
  });

  it('emits a validated customer pick carrying name, phone and email', async () => {
    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();

    expect(events).toHaveLength(1);
    const parsed = pickEventSchema.safeParse(events[0]);
    expect(parsed.success).toBe(true);
    expect(events[0]).toEqual({
      kind: 'customer',
      name: 'Budi',
      phone: '081234567890',
      email: 'budi@email.test',
    });
    expect(input().value).toBe('');
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('emits an empty email for a customer without one', async () => {
    await type('siti');
    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();

    expect(events.at(-1)).toEqual({
      kind: 'customer',
      name: 'Siti',
      phone: '',
      email: '',
    });
  });

  it('emits a product pick with quantity 1 when mode is product', async () => {
    await mount({ mode: 'product' });
    await focusInput();

    options()[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await nextTick();

    expect(events).toHaveLength(1);
    const parsed = pickEventSchema.safeParse(events[0]);
    expect(parsed.success).toBe(true);
    expect(events[0]).toEqual({
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

    await press('Enter');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'customer', name: 'Siti' });
  });

  it('wraps the highlight from the last option back to the first', async () => {
    await press('ArrowUp');
    const last = options().length - 1;
    expect(options()[last]?.getAttribute('aria-selected')).toBe('true');

    await press('ArrowDown');
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
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
