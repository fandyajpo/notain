import { ID_SEGMENT_PATTERN } from '../../src/lib/edit-route';
import { apiError } from '../_lib/http';
import { serveShell } from '../_lib/shell';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `GET /site/<ownerId>` — the public business page at a URL that looks like a
 * dynamic route.
 *
 * The same static-site trick as `/invoice/<id>`: `/site/` is the only shell
 * that was built, and this function serves it under `/site/<ownerId>` while
 * leaving the address bar exactly as the visitor typed it — no redirect, no
 * query string, because the path *is* the capability URL the owner shares.
 *
 * The id is read on the client from `location.pathname` by
 * `siteIdFromLocation`, which shares `ID_SEGMENT_PATTERN` imported above: the
 * two halves have to agree on what counts as an id, so they import the same
 * rule. The dev twin is the middleware in `astro.config.mjs`, which rewrites
 * the same shape to the same shell under `astro dev`.
 *
 * Deeper paths and non-id segments are not this route and go back to the
 * asset store untouched — including the bare `/site/` shell, whose app
 * explains that the link is incomplete rather than inventing a page.
 */
export const onRequest: PagesFunction<Env> = ({ request, params, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return apiError(405, 'method_not_allowed', 'Halaman ini hanya bisa dibuka.', {
      allow: 'GET, HEAD',
    });
  }

  // Wrangler compiles `[[id]]` to a `:id*` repeat parameter, so this arrives
  // as `['6acc…']`, not `'6acc…'` — same array shape as the invoice function.
  const raw = params.id;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];

  // Anything deeper than one segment is not this route.
  if (segments.length > 1) return env.ASSETS.fetch(request);

  const segment = segments[0];
  if (!segment || !ID_SEGMENT_PATTERN.test(segment)) return env.ASSETS.fetch(request);

  return serveShell(request, env, '/site/');
};
