import type { QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './client';

/**
 * One `QueryClient` for the app shell (`DashboardLayout.astro`).
 *
 * The shell lives outside every page island, so shell components (sign-out,
 * the admin nav link) cannot reach a page's provider. They share this single
 * client so the shell costs one cache, not one per component, and so a
 * session change seen by one is seen by both.
 */
let shellClient: QueryClient | undefined;

export function getShellClient(): QueryClient {
  shellClient ??= createQueryClient();
  return shellClient;
}
