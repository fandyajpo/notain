// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useCreateOrg, useRenameOrg } from './use-orgs';
import type { OrgView } from '../../../app/orgs';
import { getActiveOrgId, setActiveOrgId } from '../../../app/active-org';
import { AppError, ERROR_CODES } from '../../../core/shared/errors';

/**
 * `useRenameOrg` must make a new organization name visible in the shared
 * orgs cache synchronously on success — the sidebar switcher reads that exact
 * cache, so anything slower (a bare invalidation round-trip) leaves the
 * dropdown on the old name while the rest of the UI has moved on.
 */

const mocks = vi.hoisted(() => ({
  renameOrg: vi.fn(),
  listOrgs: vi.fn(),
  createOrg: vi.fn(),
}));

vi.mock('../../../app/orgs', () => ({
  listOrgs: mocks.listOrgs,
  renameOrg: mocks.renameOrg,
  createOrg: mocks.createOrg,
  acceptPendingInvites: vi.fn(async () => []),
  deleteOrgCascade: vi.fn(async () => undefined),
  inviteOrgMember: vi.fn(),
  listOrgMembers: vi.fn(async () => []),
  removeOrgMember: vi.fn(async () => undefined),
  setOrgBusinessType: vi.fn(async () => undefined),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const ORG: OrgView = {
  id: 'org_aaaaaaaaaaaaaaaa',
  name: 'Kopi Senja',
  role: 'owner',
  isOwner: true,
  plan: 'free',
  active: false,
  businessType: null,
};

const NEW_ORG: OrgView = {
  id: 'org_bbbbbbbbbbbbbbbb',
  name: 'Kopi Senja Cabang 2',
  role: 'owner',
  isOwner: true,
  plan: 'free',
  active: false,
  businessType: null,
};

/** Polls an assertion while flushing React and a real timer tick. */
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

function RenameHarness() {
  const rename = useRenameOrg(ORG.id);
  return (
    <button type="button" onClick={() => rename.mutate('Kopi Senja Baru')}>
      Simpan
    </button>
  );
}

function CreateHarness({ switchTo = true }: { switchTo?: boolean }) {
  const create = useCreateOrg();
  return (
    <button type="button" onClick={() => create.mutate({ name: NEW_ORG.name, switchTo })}>
      Buat organisasi
    </button>
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  setActiveOrgId(null);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient.setQueryData(['orgs'], { orgs: [ORG], pending: [] });
  mocks.renameOrg.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  setActiveOrgId(null);
  vi.clearAllMocks();
});

describe('useRenameOrg', () => {
  it('patches the shared orgs cache on success so the switcher updates immediately', async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RenameHarness />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container.querySelector('button')?.click();
    });

    await until(() => expect(mocks.renameOrg).toHaveBeenCalledTimes(1));
    // Synchronous patch — before any refetch could answer — so every consumer
    // of the one shared cache sees the new name in the very next frame.
    await until(() =>
      expect(queryClient.getQueryData(['orgs'])).toMatchObject({
        orgs: [{ id: ORG.id, name: 'Kopi Senja Baru' }],
      }),
    );
  });
});

/**
 * The create path must be visible in the SAME shared cache the sidebar
 * switcher reads, and it must win the race against `OrgGate`'s ensure effect:
 * flipping the selection while the list still lacked the new org made the gate
 * bounce the selection back to the first org. The patch therefore has to land
 * synchronously on success, ahead of (and independent of) any refetch.
 */
describe('useCreateOrg', () => {
  it('adds the new org to the shared cache and makes it active on success', async () => {
    mocks.createOrg.mockResolvedValue(NEW_ORG);
    // Realistic starting point: an org is already selected.
    setActiveOrgId(ORG.id);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CreateHarness />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container.querySelector('button')?.click();
    });

    await until(() => expect(mocks.createOrg).toHaveBeenCalledTimes(1));
    // The dropdown's row, patched synchronously — no refetch round-trip needed.
    await until(() =>
      expect(queryClient.getQueryData(['orgs'])).toMatchObject({
        orgs: [ORG, NEW_ORG],
      }),
    );
    expect(getActiveOrgId()).toBe(NEW_ORG.id);
    // …and still refetched afterwards, so the server stays the source of truth.
    await until(() => expect(queryClient.getQueryState(['orgs'])?.isInvalidated).toBe(true));
  });

  it('leaves the selection alone when the caller defers the switch', async () => {
    mocks.createOrg.mockResolvedValue(NEW_ORG);
    setActiveOrgId(ORG.id);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CreateHarness switchTo={false} />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container.querySelector('button')?.click();
    });

    await until(() =>
      expect(queryClient.getQueryData(['orgs'])).toMatchObject({ orgs: [ORG, NEW_ORG] }),
    );
    // The settings modal shows its success panel first and flips the selection
    // from "Selesai" — flipping here would unmount that panel mid-callback.
    expect(getActiveOrgId()).toBe(ORG.id);
  });

  it('keeps the list untouched and surfaces the error when the server rejects', async () => {
    mocks.createOrg.mockRejectedValue(
      new AppError(ERROR_CODES.VALIDATION, 'Nama organisasi sudah dipakai.'),
    );

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CreateHarness />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      container.querySelector('button')?.click();
    });

    await until(() => expect(mocks.createOrg).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData(['orgs'])).toMatchObject({ orgs: [ORG] });
    expect(getActiveOrgId()).toBeNull();
  });
});
