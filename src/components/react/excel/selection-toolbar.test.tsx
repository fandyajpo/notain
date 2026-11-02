// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { SelectionToolbar, hasSelection } from './selection-toolbar';

/**
 * The toolbar contract the three pages share: it appears only for a real
 * selection, states the exact global count, offers CSV/XLSX/PDF (of the whole
 * selection — the getter is the caller's), and renders Merge only where the
 * page passed it. That last point is the customer-only rule: no page, no
 * merge button, with no page check anywhere in this component.
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

function button(label: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    ) ?? null
  );
}

function click(label: string): void {
  const target = button(label);
  expect(target, `expected a "${label}" button`).toBeTruthy();
  act(() => target?.click());
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
});

const getRows = vi.fn(() => [['Nama'], ['Budi']]);

function baseProps() {
  return {
    noun: 'pelanggan',
    onClear: vi.fn(),
    exportOptions: { filename: 'x', sheetName: 'X', getRows },
  };
}

describe('hasSelection', () => {
  it('hides for an empty selection and shows for anything else', () => {
    expect(hasSelection(0)).toBe(false);
    expect(hasSelection(3)).toBe(true);
    // A resolving all-scope still holds rows — only its size is pending.
    expect(hasSelection(null)).toBe(true);
  });
});

describe('SelectionToolbar', () => {
  it('states the count and the noun', async () => {
    await render(<SelectionToolbar {...baseProps()} count={12} />);
    expect(container.textContent).toContain('12');
    expect(container.textContent).toContain('pelanggan dipilih');
  });

  it('shows a pending marker instead of a wrong number while a scope resolves', async () => {
    await render(<SelectionToolbar {...baseProps()} count={null} />);
    expect(container.textContent).toContain('…');
    expect(container.textContent).toContain('pelanggan dipilih');
  });

  it('offers CSV, XLSX and PDF plus the way out', async () => {
    await render(<SelectionToolbar {...baseProps()} count={1} />);
    expect(button('CSV')).toBeTruthy();
    expect(button('XLSX')).toBeTruthy();
    expect(button('PDF')).toBeTruthy();
    expect(button('Batalkan pilihan')).toBeTruthy();
  });

  it('renders no Merge button unless the page passed one (customer-only rule)', async () => {
    await render(<SelectionToolbar {...baseProps()} count={3} />);
    expect(button('Gabung')).toBeNull();
    expect(container.textContent).not.toContain('Gabung');
  });

  it('renders Merge with its own disabled state when passed', async () => {
    const onClick = vi.fn();
    await render(
      <SelectionToolbar {...baseProps()} count={3} merge={{ onClick, disabled: true }} />,
    );
    const mergeButton = button('Gabung');
    expect(mergeButton).toBeTruthy();
    expect(mergeButton?.disabled).toBe(true);

    await render(<SelectionToolbar {...baseProps()} count={3} merge={{ onClick }} />);
    click('Gabung');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('wires the clear action and renders page-specific actions', async () => {
    const onClear = vi.fn();
    await render(
      <SelectionToolbar
        {...baseProps()}
        count={2}
        onClear={onClear}
        actions={<span>extra</span>}
      />,
    );
    expect(container.textContent).toContain('extra');
    click('Batalkan pilihan');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
