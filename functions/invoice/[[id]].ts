import {
  ID_SEGMENT_PATTERN,
  INVOICE_RESERVED_SEGMENTS,
  invoiceEditCanonicalTarget,
} from '../../src/lib/edit-route';
import { apiError } from '../_lib/http';
import { redirectTo, serveShell } from '../_lib/shell';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `GET /invoice/<id>` — the edit page at a URL that looks like a dynamic route.
 *
 * The site is still fully static: `/invoice/edit/` is the only shell that was
 * built, and this function serves it under `/invoice/<id>` while leaving the
 * address bar exactly as the visitor typed it. The id routes never redirect: a
 * redirect would put a query string back in the URL, which is what these
 * routes exist to avoid.
 *
 * The older `/invoice/edit?id=…` link is the one exception: it folds onto the
 * canonical route with a real redirect (see `invoiceEditCanonicalTarget`), so
 * every invoice is reachable at exactly one URL; without an id it still gets
 * the shell, and the app explains that the link is incomplete.
 *
 * `/invoice/new` and `/invoice/print` are files of their own and go back to
 * the asset store untouched. The id itself is read on the client from
 * `location.pathname`, by `invoiceIdFromLocation`, which shares the pattern
 * and the reserved segments imported above: the two halves have to agree on
 * what counts as an id, so they import the same rules.
 */
export const onRequest: PagesFunction<Env> = ({ request, params, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return apiError(405, 'method_not_allowed', 'Halaman ini hanya bisa dibuka.', {
      allow: 'GET, HEAD',
    });
  }

  // Wrangler compiles `[[id]]` to a `:id*` repeat parameter, so this arrives
  // as `['6acc…']`, not `'6acc…'` — `ID_SEGMENT_PATTERN.test` and `Set.has`
  // never noticed (both coerce or miss arrays), but a strict comparison does.
  // A single segment is the id; anything deeper is not an edit link and stays
  // with the asset store.
  const raw = params.id;
  const segment = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;

  if (segment === 'edit') {
    const target = invoiceEditCanonicalTarget(new URL(request.url).search);
    if (target) return redirectTo(target);
    return serveShell(request, env, '/invoice/edit/');
  }

  if (!segment || INVOICE_RESERVED_SEGMENTS.has(segment)) return env.ASSETS.fetch(request);

  if (ID_SEGMENT_PATTERN.test(segment)) return serveShell(request, env, '/invoice/edit/');

  return env.ASSETS.fetch(request);
};
