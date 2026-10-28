import type { QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './client';

/**
 * The ONE `QueryClient` for the whole app.
 *
 * It serves both audiences:
 *
 * - the shell islands in `DashboardLayout.astro` (org switcher, sign-out, the
 *   admin nav link), which live outside every page island and cannot reach a
 *   page's provider;
 * - every page island, through `AppProviders`.
 *
 * Pages unmount and remount on each ClientRouter navigation, so a per-mount
 * client would throw the cache away on every menu click — org list, session
 * and profile refetched each time — and would split invalidation: renaming an
 * organization from Settings would invalidate the page's cache while the
 * dropdown, reading a different cache, kept the stale name. Sharing one
 * client makes navigation cheap and `invalidateQueries` global, which is the
 * same "satu cache" contract ADR 0006 sets out for the query layer.
 *
 * Cross-cutting behaviour (retry, session-expiry handling) is configured once
 * in `createQueryClient`.
 */
let appClient: QueryClient | undefined;

export function getShellClient(): QueryClient {
  appClient ??= createQueryClient();
  return appClient;
}
