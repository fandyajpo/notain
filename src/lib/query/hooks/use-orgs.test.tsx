// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useRenameOrg } from './use-orgs';
import type { OrgView } from '../../../app/orgs';

/**
 * `useRenameOrg` must make a new organization name visible in the shared
 * orgs cache synchronously on success — the sidebar switcher reads that exact
 * cache, so anything slower (a bare invalidation round-trip) leaves the
 * dropdown on the old name while the rest of the UI has moved on.
 */

const mocks = vi.hoisted(() => ({
  renameOrg: vi.fn(),
  listOrgs: vi.fn(),
}));

vi.mock('../../../app/orgs', () => ({
  listOrgs: mocks.listOrgs,
  renameOrg: mocks.renameOrg,
  acceptPendingInvites: vi.fn(async () => []),
  createOrg: vi.fn(),
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

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
