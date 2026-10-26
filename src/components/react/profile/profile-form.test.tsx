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
  it('edits only the personal fields — no business name or type input', async () => {
    await render(<ProfileForm profile={EMPTY_PROFILE} />);

    expect(document.body.textContent).toContain('Nama kamu');
    expect(document.body.textContent).not.toContain('Jenis bisnis');
    expect(document.body.textContent).not.toContain('Nama usaha');
  });

  it('saves the personal fields without carrying business identity', async () => {
    const profile: BusinessProfile = {
      ...EMPTY_PROFILE,
      name: 'Budi',
      phone: '081234567890',
    };
    await render(<ProfileForm profile={profile} />);

    await click(button('Simpan profil'));

    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Budi', phone: '081234567890' }),
    );
    expect(saveProfile.mock.calls[0]?.[0]).not.toHaveProperty('businessName');
    expect(saveProfile.mock.calls[0]?.[0]).not.toHaveProperty('businessType');
  });
});
