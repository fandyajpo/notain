import { ID_SEGMENT_PATTERN, INVOICE_RESERVED_SEGMENTS } from '../../src/lib/edit-route';
import { apiError } from '../_lib/http';
import { serveShell } from '../_lib/shell';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `GET /invoice/<id>` — the edit page at a URL that looks like a dynamic route.
 *
 * The site is still fully static: `/invoice/edit/` is the only shell that was
 * built, and this function serves it under `/invoice/<id>` while leaving the
 * address bar exactly as the visitor typed it. Redirecting instead would put a
 * query string back in the URL, which is what these routes exist to avoid.
 *
 * `/invoice/new` and `/invoice/print` are files of their own, and
 * `/invoice/edit?id=…` is the link that predates this route — all three (plus a
 * bare `/invoice`) go back to the asset store untouched. The id itself is read
 * on the client from `location.pathname`, by `invoiceIdFromLocation`, which
 * shares the pattern and the reserved segments imported above: the two halves
 * have to agree on what counts as an id, so they import the same rules.
 */
export const onRequest: PagesFunction<Env> = ({ request, params, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return apiError(405, 'method_not_allowed', 'Halaman ini hanya bisa dibuka.', {
      allow: 'GET, HEAD',
    });
  }

  const segment = params.id;

  if (!segment || INVOICE_RESERVED_SEGMENTS.has(segment)) return env.ASSETS.fetch(request);

  if (ID_SEGMENT_PATTERN.test(segment)) return serveShell(request, env, '/invoice/edit/');

  return env.ASSETS.fetch(request);
};
