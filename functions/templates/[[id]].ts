import { ID_SEGMENT_PATTERN, templateEditCanonicalTarget } from '../../src/lib/edit-route';
import { apiError } from '../_lib/http';
import { redirectTo, serveShell } from '../_lib/shell';
import type { Env, PagesFunction } from '../_lib/types';

/** `/templates/edit` is this shell's older name, not a file any more. */
const LEGACY_EDIT_SEGMENT = 'edit';

/**
 * `GET /templates/<id>` — the template editor at a URL that looks like a
 * dynamic route — and the older `GET /templates/edit`.
 *
 * Both are one shell: `dist/templates/new/index.html`, which
 * `templateEditorTargetFromLocation` then reads the address bar to configure —
 * a blank editor, a copy of a built-in (`?from=`), or an existing template.
 *
 * The id route never redirects, but `/templates/edit` is no longer a page of
 * its own: it always moves onto the canonical URL — the id, the built-in to
 * copy, or the blank editor (see `templateEditCanonicalTarget`) — so each
 * template is reachable at exactly one URL.
 *
 * `/templates` (the list) and `/templates/new` are files of their own and are
 * handed back untouched.
 */
export const onRequest: PagesFunction<Env> = ({ request, params, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return apiError(405, 'method_not_allowed', 'Halaman ini hanya bisa dibuka.', {
      allow: 'GET, HEAD',
    });
  }

  // Wrangler compiles `[[id]]` to a `:id*` repeat parameter, so this arrives
  // as `['edit']`, not `'edit'` — `ID_SEGMENT_PATTERN.test` never noticed
  // (it coerces), but a strict comparison does. A single segment is the id;
  // anything deeper is not an edit link and stays with the asset store.
  const raw = params.id;
  const segment = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : undefined) : raw;

  if (segment === LEGACY_EDIT_SEGMENT) {
    return redirectTo(templateEditCanonicalTarget(new URL(request.url).search));
  }

  if (!segment || segment === 'new') return env.ASSETS.fetch(request);

  if (ID_SEGMENT_PATTERN.test(segment)) {
    return serveShell(request, env, '/templates/new/');
  }

  return env.ASSETS.fetch(request);
};
