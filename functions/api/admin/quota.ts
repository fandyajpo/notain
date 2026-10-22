import { requireAdmin } from '../../_lib/admin';
import { apiError, json } from '../../_lib/http';
import { PROVIDER_LIMITS, quotaPolicy, quotaSnapshot } from '../../_lib/quota';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/admin/quota` — the quota policy, this isolate's local counters,
 * and the provider limits the policy is calibrated against.
 *
 * Honesty contract (the whole point of the endpoint): nothing here claims
 * remaining monthly quota. Cloudflare's Workers quota and Appwrite's
 * reads/writes quota are not readable in real time from inside a Function —
 * Appwrite Free exposes no usage API at all, and Cloudflare's GraphQL
 * analytics are aggregated and explicitly not billing-grade. So:
 *
 * - `isolate.counters` is a **measured partial count**: requests, retries,
 *   rate-limit hits and breaker trips that THIS isolate happened to serve.
 *   It resets on isolate recycle and says so in `isolate.note`.
 * - `provider` is the published Free-plan limits (measurement date in
 *   `provider.verifiedAt`), for eyeballing the dashboard numbers against.
 * - `policy` is the effective configuration, including any `QUOTA_*`
 *   overrides set as Pages variables.
 *
 * Admin-gated like every other `/api/admin/*` route: counters are coarse
 * operational data, but they still describe the deployment.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET.', { allow: 'GET' });
  }

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;

  const snapshot = quotaSnapshot(quotaPolicy(env));
  return json(
    200,
    {
      ...snapshot,
      provider: PROVIDER_LIMITS,
      dashboards: {
        cloudflare: 'Workers & Pages → notain (requests, CPU, R2 usage) and Analytics for trends.',
        appwrite: 'Appwrite Console → organization Usage tab (reads, writes, bandwidth, function executions).',
      },
    },
    // Operational data, never a shared cache — counters move per request.
    { 'cache-control': 'no-store' },
  );
};
