// @vitest-environment jsdom
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vite-plus/test';
import { AppProviders } from './providers';
import { getShellClient } from '../../lib/query/shell-client';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/**
 * Root-cause guard for the caching fixes: every island must receive the ONE
 * module-level QueryClient, not a per-mount instance.
 *
 * A fresh client per island meant each menu navigation remounted a page with
 * an empty cache (org list, session, profile refetched on every click) and
 * split invalidation — renaming an org updated the page's cache while the
 * sidebar switcher, reading a different one, kept the stale name.
 */
describe('AppProviders', () => {
  it('hands every island the same shared QueryClient as the shell', () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const seen: QueryClient[] = [];
    function Capture() {
      seen.push(useQueryClient());
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <AppProviders>
            <Capture />
          </AppProviders>
          <AppProviders>
            <Capture />
          </AppProviders>
        </>,
      );
    });

    expect(seen.length).toBeGreaterThanOrEqual(2);
    // Same instance across islands — and the very instance the shell islands
    // (org switcher, sign-out, admin nav) already use.
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toBe(getShellClient());

    act(() => root.unmount());
    container.remove();
  });
});
