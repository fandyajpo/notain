// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { BUSINESS_CATEGORIES, BUSINESS_SUBTYPE_SLUGS } from '../../../core/business/taxonomy';
import { BusinessTypePicker } from './business-type-picker';

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

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-subtype]'));
}

async function typeQuery(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]');
  expect(input).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  await act(async () => {
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('BusinessTypePicker', () => {
  it('lists every subtype under its category', async () => {
    await render(<BusinessTypePicker value={null} onChange={() => {}} />);

    expect(rows()).toHaveLength(BUSINESS_SUBTYPE_SLUGS.length);
    for (const category of BUSINESS_CATEGORIES.slice(0, 3)) {
      expect(document.body.textContent).toContain(category.label);
    }
  });

  it('hands the tapped subtype back to the caller', async () => {
    const onChange = vi.fn();
    await render(<BusinessTypePicker value={null} onChange={onChange} />);

    const row = document.querySelector<HTMLElement>('[data-subtype="bengkel-mobil"]');
    await act(async () => row?.click());

    expect(onChange).toHaveBeenCalledWith('bengkel-mobil');
  });

  it('marks the current choice so it is visible without tapping', async () => {
    await render(<BusinessTypePicker value="restoran" onChange={() => {}} />);

    expect(document.querySelector('[data-subtype="restoran"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      document.querySelector('[data-subtype="bengkel-mobil"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('narrows the list to what the search matches', async () => {
    await render(<BusinessTypePicker value={null} onChange={() => {}} />);

    await typeQuery('bengkel');

    const labels = rows().map((row) => row.textContent);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(BUSINESS_SUBTYPE_SLUGS.length);
    expect(document.querySelector('[data-subtype="bengkel-mobil"]')).toBeTruthy();
    expect(document.querySelector('[data-subtype="bengkel-motor"]')).toBeTruthy();
    expect(document.querySelector('[data-subtype="restoran"]')).toBeNull();
  });

  it('says so when nothing matches instead of showing a hollow list', async () => {
    await render(<BusinessTypePicker value={null} onChange={() => {}} />);

    await typeQuery('zzzzz');

    expect(rows()).toHaveLength(0);
    expect(document.body.textContent).toContain('Tidak ada yang cocok');
  });
});
