import { ID_SEGMENT_PATTERN } from '../../src/lib/edit-route';
import { apiError } from '../_lib/http';
import { serveShell } from '../_lib/shell';
import type { Env, PagesFunction } from '../_lib/types';

/** `/templates/edit` is this shell's older name, not a file any more. */
const LEGACY_EDIT_SEGMENT = 'edit';

/**
 * `GET /templates/<id>` and the older `GET /templates/edit` — the template
 * editor, at URLs that look like dynamic routes.
 *
 * Both are one shell: `dist/templates/new/index.html`, which
 * `templateEditorTargetFromLocation` then reads the address bar to configure —
 * a blank editor, a copy of a built-in (`?from=`), or an existing template.
 * Nothing here redirects, so links written before this route keep working
 * down to the query string.
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

  const segment = params.id;

  if (!segment || segment === 'new') return env.ASSETS.fetch(request);

  if (segment === LEGACY_EDIT_SEGMENT || ID_SEGMENT_PATTERN.test(segment)) {
    return serveShell(request, env, '/templates/new/');
  }

  return env.ASSETS.fetch(request);
};
