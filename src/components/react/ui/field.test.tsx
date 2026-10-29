// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSampleInvoice } from '../../../core/invoice/sample';
import { invoiceDraftSchema } from '../../../core/invoice/schema';
import { errorMessage, FieldShell } from './field';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

async function render(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

/** The issue Zod 4 produces when the required customer name is emptied. */
function customerNameIssue(): unknown {
  const { draft } = createSampleInvoice();
  const result = invoiceDraftSchema.safeParse({ ...draft, customerName: '' });
  if (result.success) throw new Error('expected the draft to fail validation');
  return result.error.issues.find((issue) => issue.path.join('.') === 'customerName');
}

describe('errorMessage', () => {
  it('reads the message off a raw Zod 4 issue object', () => {
    expect(errorMessage(customerNameIssue())).toBe('Masukkan nama pelanggan terlebih dahulu.');
  });

  it('unwraps a whole ZodError down to its first issue', () => {
    const { draft } = createSampleInvoice();
    const result = invoiceDraftSchema.safeParse({ ...draft, customerName: '', items: [] });
    expect(errorMessage(result.error)).toBeTruthy();
  });

  it('passes a plain string through untouched', () => {
    expect(errorMessage('Nama barang belum diisi.')).toBe('Nama barang belum diisi.');
    expect(errorMessage('')).toBeUndefined();
  });

  it('returns nothing for anything it cannot read', () => {
    expect(errorMessage(null)).toBeUndefined();
    expect(errorMessage(undefined)).toBeUndefined();
    expect(errorMessage({ some: 'object' })).toBeUndefined();
    expect(errorMessage(42)).toBeUndefined();
  });
});

describe('FieldShell', () => {
  it('renders a Zod issue object as its message instead of crashing', async () => {
    await render(
      <FieldShell label="Nama pelanggan" htmlFor="customerName" error={customerNameIssue()}>
        <input id="customerName" />
      </FieldShell>,
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Masukkan nama pelanggan terlebih dahulu.');
  });

  it('falls back to the hint when there is no error', async () => {
    await render(
      <FieldShell label="Nama pelanggan" htmlFor="customerName" hint="Contoh: Budi">
        <input id="customerName" />
      </FieldShell>,
    );

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Contoh: Budi');
  });
});
