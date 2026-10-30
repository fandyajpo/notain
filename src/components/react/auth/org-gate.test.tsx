// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { OrgGate } from './org-gate';
import { getActiveOrgId, setActiveOrgId } from '../../../app/active-org';
import { beginOrgSwitch, endOrgSwitch, getOrgSwitch } from '../../../app/org-switch';
import type { OrgView } from '../../../app/orgs';

/**
 * OrgGate — the tenancy stage between "signed in" and everything else:
 *
 * - an account with zero organizations must land on the two-step ONBOARDING
 *   (children stay unmounted: no org = no data, no fetches) — its final step
 *   creates the organization from the business name itself;
 * - a persisted pick the server's list no longer contains (deleted org,
 *   revoked membership, another account on this browser) swaps to the first
 *   org the account actually has, while a still-valid pick survives;
 * - a real switch between two orgs clears the page's caches, so org A's data
 *   can never be painted under org B;
 * - the invite sweep runs once per mount and its answer can turn an empty
 *   account into a member of an invited org without a click.
 *
 * The app layer (`src/app/orgs`) is mocked; the gate's own ensure/swap/clear
 * logic and TanStack Query's flow are not.
 */

const mocks = vi.hoisted(() => ({
  listOrgs: vi.fn(),
  acceptPendingInvites: vi.fn(),
  createOrg: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
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

// The onboarding modal the empty gate now renders reaches the profile layer:
// its reads stay disabled in create mode and its save is what this test
// asserts after the org is created.
vi.mock('../../../app/profile', () => ({
  getProfile: mocks.getProfile,
  saveProfile: mocks.saveProfile,
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));

vi.mock('../../../lib/tour/tour-store', () => ({
  scheduleTour: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const ORG_A: OrgView = {
  id: 'org_aaaaaaaaaaaaaaaa',
  name: 'Kopi Senja',
  role: 'owner',
  isOwner: true,
  plan: 'free',
  active: false,
  businessType: null,
};
const ORG_B: OrgView = {
  id: 'org_bbbbbbbbbbbbbbbb',
  name: 'Toko Sebelah',
  role: 'member',
  isOwner: false,
  plan: 'free',
  active: false,
  businessType: null,
};

/**
 * Waits for an assertion to hold, flushing React and a real timer tick on
 * every attempt — a query's resolution travels through TanStack's notify
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

/** Mounts the gate with an `APP` marker as the content it protects. */
function renderGate(): void {
  render(
    <OrgGate>
      <div>APP</div>
    </OrgGate>,
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  setActiveOrgId(null);
  // The switch store is module-level, like `active-org` — a test that starts
  // a switch must not leak its pending state into the next one.
  endOrgSwitch();
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // The app's own client pins mutations to no-retry; without this a
      // rejected mutation would be replayed three times through backoff.
      mutations: { retry: false },
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.listOrgs.mockResolvedValue({ orgs: [], pending: [] });
  mocks.acceptPendingInvites.mockResolvedValue([]);
  mocks.saveProfile.mockResolvedValue({ name: '' });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  setActiveOrgId(null);
  endOrgSwitch();
  vi.clearAllMocks();
});

describe('OrgGate', () => {
  it('forces the create screen for an account with no organization', async () => {
    renderGate();
    await until(() => expect(container.textContent).toContain('Siapa nama kamu?'));

    // Nothing behind the gate exists in the DOM — no dashboard, no fetches.
    expect(container.textContent).not.toContain('APP');
    expect(getActiveOrgId()).toBeNull();
  });

  it('never shows the create screen before the invite sweep has settled', async () => {
    // Brand-new account that holds an invitation: signing up with an invited
    // address must land in the invited org, never in a flash of "create your
    // first organization".
    // Once-values answer the two expected reads; the base value covers any
    // extra refetch the invalidation schedules, so a late third read cannot
    // answer "empty" and destabilise the selection.
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A], pending: [] });
    mocks.listOrgs
      .mockResolvedValueOnce({ orgs: [], pending: [] })
      .mockResolvedValueOnce({ orgs: [ORG_A], pending: [] });
    mocks.acceptPendingInvites.mockResolvedValueOnce([ORG_A.id]);

    renderGate();

    await until(() => expect(getActiveOrgId()).toBe(ORG_A.id));
    expect(mocks.acceptPendingInvites).toHaveBeenCalledTimes(1);
    expect(mocks.listOrgs).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('APP');
    expect(container.textContent).not.toContain('Siapa nama kamu?');
  });

  it('picks the first organization when this browser has no selection yet', async () => {
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_B, ORG_A], pending: [] });

    renderGate();

    await until(() => expect(container.textContent).toContain('APP'));
    // Newest membership first (the server's order) — any valid pick works.
    expect(getActiveOrgId()).toBe(ORG_B.id);
  });

  it('swaps a persisted selection the server no longer contains', async () => {
    // A deleted org — or another account's leftover pick on this browser —
    // must never gate on: it is not in the list, so the first one is.
    window.localStorage.setItem('notain.activeOrgId', 'org_ffffffffffffffff');
    setActiveOrgId('org_ffffffffffffffff');
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A, ORG_B], pending: [] });

    renderGate();

    await until(() => expect(container.textContent).toContain('APP'));
    expect(getActiveOrgId()).toBe(ORG_A.id);
  });

  it('keeps a still-valid selection exactly as the user left it', async () => {
    window.localStorage.setItem('notain.activeOrgId', ORG_B.id);
    setActiveOrgId(ORG_B.id);
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A, ORG_B], pending: [] });

    renderGate();

    await until(() => expect(container.textContent).toContain('APP'));
    expect(getActiveOrgId()).toBe(ORG_B.id);
    // No switch happened, so nothing was wiped out from under the page.
    await until(() => expect(queryClient.getQueryData(['orgs'])).toBeDefined());
  });

  it('clears every per-org cache when the selection switches', async () => {
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A, ORG_B], pending: [] });

    renderGate();
    await until(() => expect(getActiveOrgId()).toBe(ORG_A.id));

    // Simulate org A's data sitting in the page cache…
    queryClient.setQueryData(['invoices', ''], ['org-a-row']);

    // …then the switcher moves to org B.
    act(() => {
      setActiveOrgId(ORG_B.id);
    });

    await until(() => expect(getActiveOrgId()).toBe(ORG_B.id));
    // The stale rows are gone, not merely background-refetched: a switch
    // under a loading indicator beats a flash of the previous org's numbers.
    expect(queryClient.getQueryData(['invoices', ''])).toBeUndefined();
    expect(container.textContent).toContain('APP');
  });

  it('blocks the screen during a switch and lifts the overlay once the target org is ready', async () => {
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A, ORG_B], pending: [] });

    renderGate();
    await until(() => expect(getActiveOrgId()).toBe(ORG_A.id));
    await until(() => expect(container.textContent).toContain('APP'));

    // Exactly what the dropdown does: flag the transition (carrying the
    // target's name), then move the selection. The overlay is portalled to
    // `document.body`, above the app.
    act(() => {
      beginOrgSwitch(ORG_A.id, ORG_B.id, ORG_B.name);
      setActiveOrgId(ORG_B.id);
    });

    // The name comes from the switch store, not the orgs cache — the cache is
    // mid-reset at this point, so a cache-derived label would read
    // "Berpindah ke organisasi…" for the whole transition.
    await until(() => expect(document.body.textContent).toContain('Berpindah ke Toko Sebelah…'));

    // The refetch settles (the harness resolves immediately), so once the
    // minimum display time passes the gate must clear the switch by itself
    // and remount the children for the target org.
    await until(() => expect(getOrgSwitch()).toBeNull(), 750);
    expect(document.body.textContent).not.toContain('Berpindah ke');
    expect(getActiveOrgId()).toBe(ORG_B.id);
    await until(() => expect(container.textContent).toContain('APP'));
  });

  it('restores the previous organization when the switch fails', async () => {
    // Base answer stays valid for the recovery refetch AFTER the rollback;
    // only the refetch the switch itself triggers is allowed to fail.
    mocks.listOrgs.mockResolvedValue({ orgs: [ORG_A, ORG_B], pending: [] });
    mocks.listOrgs.mockResolvedValueOnce({ orgs: [ORG_A, ORG_B], pending: [] });
    mocks.listOrgs.mockRejectedValueOnce(new Error('network down'));
    renderGate();
    await until(() => expect(getActiveOrgId()).toBe(ORG_A.id));
    await until(() => expect(container.textContent).toContain('APP'));

    // The list refetch a switch triggers now fails (revoked membership,
    // offline): the gate must roll back to the org we came from and drop the
    // overlay instead of hanging on it.
    act(() => {
      beginOrgSwitch(ORG_A.id, ORG_B.id, ORG_B.name);
      setActiveOrgId(ORG_B.id);
    });

    await until(() => expect(getOrgSwitch()).toBeNull(), 300);
    expect(getActiveOrgId()).toBe(ORG_A.id);
    expect(document.body.textContent).not.toContain('Berpindah ke');
  });

  it('lands in a newly created organization when the account was empty', async () => {
    const created: OrgView = {
      id: 'org_cccccccccccccccc',
      name: 'Usaha Baru',
      role: 'owner',
      isOwner: true,
      plan: 'free',
      active: false,
      businessType: null,
    };
    mocks.listOrgs.mockResolvedValue({ orgs: [created], pending: [] });
    mocks.listOrgs
      .mockResolvedValueOnce({ orgs: [], pending: [] })
      .mockResolvedValueOnce({ orgs: [created], pending: [] });
    mocks.createOrg.mockResolvedValue(created);

    renderGate();
    await until(() => expect(container.textContent).toContain('Siapa nama kamu?'));

    const type = (placeholder: string, value: string) =>
      act(async () => {
        const input = container.querySelector<HTMLInputElement>(
          `input[placeholder="${placeholder}"]`,
        );
        expect(input, `input "${placeholder}" must render`).toBeTruthy();
        // Native setter + input event, so React's controlled value keeps up.
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set?.call(input, value);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
      });

    const click = (label: string) =>
      act(async () => {
        const button = [...container.querySelectorAll('button')].find(
          (node) => node.textContent?.trim() === label,
        );
        expect(button, `button "${label}" must render`).toBeTruthy();
        button?.click();
      });

    // Step 0 → step 1.
    await type('Fandy Ahmad', 'Fandy Ahmad');
    await click('Lanjut');
    // The business name IS the organization's name — one submit mints the org
    // AND writes the personal profile.
    await type('Bengkel Jaya', 'Usaha Baru');
    await click('Buat dan mulai');

    await until(() => expect(getActiveOrgId()).toBe(created.id));
    expect(mocks.createOrg).toHaveBeenCalledTimes(1);
    expect(mocks.createOrg.mock.calls[0]?.[0]).toBe('Usaha Baru');
    await until(() => expect(mocks.saveProfile).toHaveBeenCalledTimes(1));
    expect(mocks.saveProfile.mock.calls[0]?.[0]).toMatchObject({
      name: 'Fandy Ahmad',
    });
    await until(() => expect(container.textContent).toContain('APP'));
  });
});
