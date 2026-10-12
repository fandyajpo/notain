// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CalcTotals } from './CalcInspector';
import './register';

const FULL: CalcTotals = {
  subtotal: 50_000,
  discountAmount: 5_000,
  taxAmount: 4_950,
  grandTotal: 49_950,
};

let host: HTMLElement & { totals?: unknown };

async function mount(totals: unknown) {
  const node = document.createElement('notain-calc-inspector') as HTMLElement & {
    totals: unknown;
  };
  node.totals = totals;
  document.body.appendChild(node);
  await Promise.resolve();
  await Promise.resolve();
  host = node;
  return node;
}

function text(): string {
  return host.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

beforeEach(async () => {
  document.body.innerHTML = '';
  await mount(FULL);
});

describe('notain-calc-inspector', () => {
  it('renders every line of a full summary', () => {
    expect(host.querySelector('[data-subtotal]')?.textContent?.trim()).toBe('Rp50.000');
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp49.950');
    expect(text()).toContain('Diskon');
    expect(text()).toContain('−Rp5.000');
    expect(text()).toContain('Pajak');
    expect(text()).toContain('+Rp4.950');
  });

  it('hides discount and tax rows when they are zero', async () => {
    await mount({ subtotal: 10_000, discountAmount: 0, taxAmount: 0, grandTotal: 10_000 });
    expect(text()).not.toContain('Diskon');
    expect(text()).not.toContain('Pajak');
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp10.000');
  });

  it('updates in place when totals change', async () => {
    await mount({ subtotal: 1_000, discountAmount: 0, taxAmount: 0, grandTotal: 1_000 });
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp1.000');

    host.totals = { subtotal: 2_000, discountAmount: 0, taxAmount: 0, grandTotal: 2_000 };
    await Promise.resolve();
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp2.000');
  });

  it('falls back to zeros for a malformed payload', async () => {
    await mount({ subtotal: 'nope', grandTotal: null });
    expect(host.querySelector('[data-subtotal]')?.textContent?.trim()).toBe('Rp0');
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp0');
    expect(text()).not.toContain('Diskon');
  });

  it('tolerates a missing totals property', async () => {
    await mount(undefined);
    expect(host.querySelector('[data-total]')?.textContent?.trim()).toBe('Rp0');
  });
});
