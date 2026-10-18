// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SetupChecklist } from './setup-checklist';
import { EMPTY_PROFILE, type BusinessProfile } from '../../../core/profile/model';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const INCOMPLETE_SEEN_KEY = 'notain.setup.incomplete-seen';
const CELEBRATED_KEY = 'notain.setup.celebrated';

/** Profile with every step the checklist scores already filled in. */
const DONE_PROFILE: BusinessProfile = {
  ...EMPTY_PROFILE,
  name: 'Toko Uji',
  logoUrl: 'https://example.com/logo.png',
};

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
  window.localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('SetupChecklist', () => {
  it('shows the unfinished steps and records that this device saw them', async () => {
    await render(<SetupChecklist profile={EMPTY_PROFILE} hasInvoices={false} hidden={false} />);

    expect(container.textContent).toContain('Langkah awal');
    expect(container.textContent).toContain('Lengkapi profil usaha');
    expect(container.textContent).toContain('Buat invoice pertama');
    expect(container.textContent).toContain('0/3 selesai');
    expect(window.localStorage.getItem(INCOMPLETE_SEEN_KEY)).toBe('1');
    expect(window.localStorage.getItem(CELEBRATED_KEY)).toBeNull();
  });

  it('stays hidden while the inputs are still unknown', async () => {
    await render(<SetupChecklist profile={undefined} hasInvoices={false} hidden />);

    expect(container.textContent).toBe('');
    expect(window.localStorage.getItem(INCOMPLETE_SEEN_KEY)).toBeNull();
  });

  it('disappears silently for an account that never saw the checklist incomplete', async () => {
    await render(<SetupChecklist profile={DONE_PROFILE} hasInvoices hidden={false} />);

    expect(container.textContent).toBe('');
  });

  it('swaps to the completion card once every step is done', async () => {
    window.localStorage.setItem(INCOMPLETE_SEEN_KEY, '1');
    await render(<SetupChecklist profile={DONE_PROFILE} hasInvoices hidden={false} />);

    expect(container.textContent).toContain('3/3 selesai');
    expect(container.textContent).toContain('Semua siap!');
    expect(container.textContent).not.toContain('Lengkapi profil usaha');
  });

  it('honours the dismissal so later visits stay quiet', async () => {
    window.localStorage.setItem(INCOMPLETE_SEEN_KEY, '1');
    await render(<SetupChecklist profile={DONE_PROFILE} hasInvoices hidden={false} />);
    expect(container.textContent).toContain('Semua siap!');

    const dismiss = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Oke, mantap',
    );
    await act(async () => {
      dismiss?.click();
    });

    expect(container.textContent).toBe('');
    expect(window.localStorage.getItem(CELEBRATED_KEY)).toBe('1');
  });
});
