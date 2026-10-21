// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { EMPTY_PROFILE, type BusinessProfile } from '../../../core/profile/model';
import { ProfileForm } from './profile-form';

const saveProfile = vi.fn(async (profile: BusinessProfile) => profile);

vi.mock('../../../lib/query/hooks/use-profile', () => ({
  useSaveProfile: () => ({ mutateAsync: saveProfile, isPending: false }),
  useUploadLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../lib/ui/toast', () => ({ toast: vi.fn() }));

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

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

async function click(target: Element | null | undefined) {
  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  saveProfile.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('ProfileForm', () => {
  it('shows the picked business type after the picker modal is saved', async () => {
    await render(<ProfileForm profile={{ ...EMPTY_PROFILE, businessType: null }} />);
    expect(document.body.textContent).toContain('Belum ditentukan');

    await click(button('Ubah'));
    await click(document.querySelector('[data-subtype="bengkel-mobil"]'));
    await click(button('Simpan'));

    expect(document.body.textContent).toContain('Bengkel Mobil');
    expect(document.body.textContent).not.toContain('Belum ditentukan');
  });

  it('submits the picked business type and keeps showing it after save', async () => {
    const profile: BusinessProfile = {
      ...EMPTY_PROFILE,
      name: 'Budi',
      businessName: 'Warung Maju',
      phone: '081234567890',
    };
    await render(<ProfileForm profile={profile} />);

    await click(button('Ubah'));
    await click(document.querySelector('[data-subtype="katering"]'));
    await click(button('Simpan'));

    await click(button('Simpan profil'));

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ businessType: 'katering' }));
    expect(document.body.textContent).toContain('Katering');
  });
});
