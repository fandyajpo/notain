// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { CheckoutApp } from './checkout-app';
import { PaymentResultApp } from './payment-result-app';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

async function mount(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Both pages are `client:only` islands, so nothing above them can supply the
 * QueryClient. Without their own `AppProviders` the first react-query hook
 * throws "No QueryClient set", `IslandBoundary` swallows it, and the visitor
 * gets the generic failure card — which is exactly what checkout looked like
 * in production: a blank page before any order could be created.
 */
describe('checkout islands own their QueryClient', () => {
  it('renders /checkout without an outer provider', async () => {
    await mount(<CheckoutApp />);

    expect(container.textContent).not.toContain('Halaman ini gagal dimuat');
    expect(container.textContent).toContain('Memeriksa sesi');
  });

  it('renders /payment/result without an outer provider', async () => {
    await mount(<PaymentResultApp />);

    expect(container.textContent).not.toContain('Halaman ini gagal dimuat');
    expect(container.textContent).toContain('Tautan tidak lengkap');
  });
});
