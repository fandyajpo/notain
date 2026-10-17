// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessTypeField } from './business-type-field';

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
  return {
    async rerender(next: ReactNode) {
      await act(async () => {
        root?.render(next);
      });
    },
  };
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function openModal() {
  await act(async () => button('Ubah')?.click());
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('BusinessTypeField', () => {
  it('reads back the current choice, or says there is none', async () => {
    const view = await render(<BusinessTypeField value={null} onChange={() => {}} />);
    expect(document.body.textContent).toContain('Belum ditentukan');

    await view.rerender(<BusinessTypeField value="bengkel-mobil" onChange={() => {}} />);
    expect(document.body.textContent).toContain('Bengkel Mobil');
  });

  it('applies the pick only once Simpan is pressed', async () => {
    const onChange = vi.fn();
    await render(<BusinessTypeField value={null} onChange={onChange} />);
    await openModal();

    await act(async () =>
      document.querySelector<HTMLElement>('[data-subtype="bengkel-mobil"]')?.click(),
    );
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => button('Simpan')?.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('bengkel-mobil');
  });

  it('discards the choice when the modal is closed without saving', async () => {
    const onChange = vi.fn();
    await render(<BusinessTypeField value={null} onChange={onChange} />);
    await openModal();

    await act(async () =>
      document.querySelector<HTMLElement>('[data-subtype="bengkel-mobil"]')?.click(),
    );
    await act(async () => button('Batal')?.click());

    expect(onChange).not.toHaveBeenCalled();
  });

  it('can clear the type back to none', async () => {
    const onChange = vi.fn();
    await render(<BusinessTypeField value="bengkel-mobil" onChange={onChange} />);
    await openModal();

    await act(async () => button('Tanpa jenis')?.click());
    await act(async () => button('Simpan')?.click());

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
