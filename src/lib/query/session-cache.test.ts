import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vite-plus/test';
import type { SessionUser } from '../../ports/auth-repository';
import { queryKeys } from './keys';
import { adoptSession } from './session-cache';

const alice: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };
const bob: SessionUser = { id: 'user-b', email: 'b@example.com', name: 'Bob' };

/** Puts data under a key as if a query for that account had already resolved. */
function seed(client: QueryClient, key: readonly unknown[], data: unknown): void {
  client.setQueryData(key, data);
}

describe('adoptSession', () => {
  it('drops the previous account’s data when someone else signs in', () => {
    const client = new QueryClient();

    seed(client, queryKeys.invoices(''), [{ id: 'invoice-of-alice' }]);
    seed(client, queryKeys.profile, { name: 'Alice Warung' });
    seed(client, queryKeys.invoiceNumbers, ['INV-001']);

    adoptSession(client, bob);

    // Query keys are not namespaced by user id, so anything left behind would
    // be handed straight to the next account.
    expect(client.getQueryData(queryKeys.invoices(''))).toBeUndefined();
    expect(client.getQueryData(queryKeys.profile)).toBeUndefined();
    expect(client.getQueryData(queryKeys.invoiceNumbers)).toBeUndefined();
  });

  it('leaves the new session as the only surviving entry', () => {
    const client = new QueryClient();

    seed(client, queryKeys.invoices(''), [{ id: 'invoice-of-alice' }]);
    seed(client, queryKeys.session, alice);

    adoptSession(client, bob);

    expect(client.getQueryData(queryKeys.session)).toEqual(bob);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it('clears everything and records a null session on sign-out', () => {
    const client = new QueryClient();

    seed(client, queryKeys.session, alice);
    seed(client, queryKeys.invoices('search term'), [{ id: 'x' }]);
    seed(client, queryKeys.invoice('inv-1'), { id: 'inv-1' });

    adoptSession(client, null);

    expect(client.getQueryData(queryKeys.session)).toBeNull();
    expect(client.getQueryData(queryKeys.invoices('search term'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.invoice('inv-1'))).toBeUndefined();
  });

  it('also drops cached searches under other keys, not just the empty one', () => {
    const client = new QueryClient();

    seed(client, queryKeys.invoices('warung'), [{ id: 'a' }]);
    seed(client, queryKeys.invoices('kopi'), [{ id: 'b' }]);

    adoptSession(client, bob);

    expect(client.getQueryData(queryKeys.invoices('warung'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.invoices('kopi'))).toBeUndefined();
  });

  it('is stable when the same account is adopted twice', () => {
    const client = new QueryClient();

    adoptSession(client, alice);
    adoptSession(client, alice);

    expect(client.getQueryData(queryKeys.session)).toEqual(alice);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });
});
