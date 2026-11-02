// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { SelectAllMenu } from './select-all-menu';

/**
 * The three select-all scopes must be distinct and honest: this page, this
 * page's filter (only offered while a filter exists), the whole dataset. A
 * "select all" that secretly means "select the loaded page" is exactly what
 * this menu must never say.
 */

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

function menuLabels(): string[] {
  return [...document.body.querySelectorAll('[role="menuitem"]')].map(
    (item) => item.textContent ?? '',
  );
}

async function openMenu(): Promise<void> {
  const trigger = container.querySelector('button');
  expect(trigger, 'expected the menu trigger').toBeTruthy();
  await act(async () => {
    trigger?.click();
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('SelectAllMenu', () => {
  it('offers the page scope with its count and the dataset scope', async () => {
    await render(
      <SelectAllMenu
        noun="invoice"
        pageCount={5}
        onSelectPage={vi.fn()}
        onSelectDataset={vi.fn()}
      />,
    );
    await openMenu();

    expect(menuLabels()).toEqual(['Pilih semua di halaman ini (5)', 'Pilih seluruh data']);
  });

  it('offers the filter scope only while a filter is active', async () => {
    const onSelectFiltered = vi.fn();
    await render(
      <SelectAllMenu
        noun="pelanggan"
        pageCount={3}
        onSelectPage={vi.fn()}
        onSelectFiltered={onSelectFiltered}
        onSelectDataset={vi.fn()}
      />,
    );
    await openMenu();

    expect(menuLabels()).toContain('Pilih semua yang cocok filter');
    const filtered = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === 'Pilih semua yang cocok filter');
    await act(async () => {
      filtered?.click();
    });
    expect(onSelectFiltered).toHaveBeenCalledTimes(1);
  });

  it('fires the chosen scope', async () => {
    const onSelectDataset = vi.fn();
    await render(
      <SelectAllMenu
        noun="entri"
        pageCount={2}
        onSelectPage={vi.fn()}
        onSelectDataset={onSelectDataset}
      />,
    );
    await openMenu();

    const dataset = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === 'Pilih seluruh data');
    await act(async () => {
      dataset?.click();
    });
    expect(onSelectDataset).toHaveBeenCalledTimes(1);
  });

  it('disables the page option when the page shows nothing', async () => {
    await render(
      <SelectAllMenu
        noun="invoice"
        pageCount={0}
        onSelectPage={vi.fn()}
        onSelectDataset={vi.fn()}
      />,
    );
    await openMenu();

    const pageItem = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes('di halaman ini'));
    expect(pageItem?.disabled).toBe(true);
  });
});
