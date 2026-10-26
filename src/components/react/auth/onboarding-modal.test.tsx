// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { OnboardingModal } from './onboarding-modal';

/**
 * OnboardingModal in CREATE mode — the screen an account with zero
 * organizations now lands on (OrgGate renders it instead of a bare "make an
 * organization" card), where the business name the user types IS the
 * organization:
 *
 * - one submit creates the org (named after the business, business name
 *   passed through for the server-side profile seed) AND saves the profile
 *   with the personal name from step 0;
 * - a failed profile save must never mint a SECOND org on retry: the create
 *   step runs at most once per mount, the retry saves the profile only.
 *
 * The app layer (`src/app/orgs`, `src/app/profile`) and the welcome-tour
 * scheduler are mocked; the two-step UI, validation and mutation sequencing
 * are the real component's.
 */

const mocks = vi.hoisted(() => ({
  listOrgs: vi.fn(),
  acceptPendingInvites: vi.fn(),
  createOrg: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  scheduleTour: vi.fn(),
}));

vi.mock('../../../app/orgs', () => ({
  listOrgs: mocks.listOrgs,
  acceptPendingInvites: mocks.acceptPendingInvites,
  createOrg: mocks.createOrg,
  renameOrg: vi.fn(async () => undefined),
  deleteOrgCascade: vi.fn(async () => undefined),
  listOrgMembers: vi.fn(async () => []),
  inviteOrgMember: vi.fn(),
  removeOrgMember: vi.fn(async () => undefined),
}));

vi.mock('../../../app/profile', () => ({
  getProfile: mocks.getProfile,
  saveProfile: mocks.saveProfile,
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));

vi.mock('../../../lib/tour/tour-store', () => ({
  scheduleTour: mocks.scheduleTour,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/**
 * Waits for an assertion to hold, flushing React and a real timer tick on
 * every attempt — a mutation's resolution travels through TanStack's notify
 * queue and React's scheduler, so a fixed flush is a coin flip under load.
 */
async function until(assertion: () => void, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      });
    }
  }
  assertion();
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render(ui: ReactNode): void {
  act(() => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
}

/** Types through a real input (native setter + input event for React). */
async function type(placeholder: string, value: string): Promise<void> {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
    expect(input, `input "${placeholder}" must render`).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Clicks the footer button whose visible text matches exactly. */
async function click(label: string): Promise<void> {
  await act(async () => {
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.textContent?.trim() === label,
    );
    expect(button, `button "${label}" must render`).toBeTruthy();
    button?.click();
  });
}

/** Steps through both pages of onboarding up to (but not incl.) submit. */
async function fillBothSteps(): Promise<void> {
  await type('Fandy Ahmad', 'Fandy Ahmad');
  await click('Lanjut');
  await type('Bengkel Jaya', 'Kopi Senja');
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // The app's own client pins mutations to no-retry; without this a
      // rejected mutation would replay through TanStack's backoff delays.
      mutations: { retry: false },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.createOrg.mockResolvedValue({ id: 'org_aaaaaaaaaaaaaaaa' });
  mocks.saveProfile.mockResolvedValue({ name: 'Fandy Ahmad' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  vi.clearAllMocks();
});

describe('OnboardingModal (create mode)', () => {
  it('creates the organization from the business name and saves the profile in one submit', async () => {
    render(<OnboardingModal createOrg />);

    await until(() => expect(container.textContent).toContain('Siapa nama kamu?'));
    // The step the org is born on says so, instead of the generic invoice copy.
    await until(() =>
      expect(container.textContent).toContain('jadi nama organisasi (ruang kerja)'),
    );

    await fillBothSteps();
    await click('Buat dan mulai');

    await until(() => expect(mocks.createOrg).toHaveBeenCalledTimes(1));
    // The org is named after the business; the profile write carries only the
    // person's name (the business name lives on the org row).
    expect(mocks.createOrg.mock.calls[0]?.[0]).toBe('Kopi Senja');

    await until(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(mocks.saveProfile.mock.calls[0]?.[0]).toMatchObject({
      name: 'Fandy Ahmad',
    });
    await until(() => expect(mocks.scheduleTour).toHaveBeenCalledWith('welcome'));
  });

  it('retries the profile save without ever creating a second organization', async () => {
    // The org lands, then the profile write fails (network blip) — retrying
    // must save the profile only: a second create would mint a duplicate org.
    mocks.saveProfile.mockRejectedValueOnce(new Error('offline'));

    render(<OnboardingModal createOrg />);
    await until(() => expect(container.textContent).toContain('Siapa nama kamu?'));

    await fillBothSteps();
    await click('Buat dan mulai');

    await until(() => expect(container.textContent).toContain('Gagal menyimpan.'));
    expect(mocks.createOrg).toHaveBeenCalledTimes(1);
    expect(mocks.saveProfile).toHaveBeenCalledTimes(1);

    // Retry: same screen (the gate still has no orgs to switch to), and the
    // create step must not run again.
    await click('Buat dan mulai');
    await until(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(2));
    expect(mocks.createOrg).toHaveBeenCalledTimes(1);
    await until(() => expect(mocks.scheduleTour).toHaveBeenCalledWith('welcome'));
  });

  it('stays on the form without creating anything when the business name is empty', async () => {
    render(<OnboardingModal createOrg />);
    await until(() => expect(container.textContent).toContain('Siapa nama kamu?'));

    await type('Fandy Ahmad', 'Fandy Ahmad');
    await click('Lanjut');
    // Step 1's button is reachable, but submit validates the empty value.
    await click('Buat dan mulai');

    await until(() => expect(container.textContent).toContain('Masukkan nama usaha kamu.'));
    expect(mocks.createOrg).not.toHaveBeenCalled();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });
});
