import type { Env } from './types';

/**
 * Answers with one of the built files, under whatever URL the browser asked
 * for.
 *
 * The shell is the only asset behind `/invoice/<id>` and `/templates/<id>`, so
 * the address bar keeps showing the id while the document served is the edit
 * page. The id routes never redirect — a redirect would put the query string
 * back in the URL, which is the exact thing those routes exist to avoid. The
 * older links (`/invoice/edit?id=…`, `/templates/edit`) are the ones that
 * move, via `redirectTo`.
 */
export function serveShell(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  return env.ASSETS.fetch(new Request(new URL(path, request.url), { method }));
}

/**
 * Answers with a redirect onto the canonical route, so each invoice and each
 * template is reachable at exactly one URL. Only GET and HEAD get this far.
 */
export function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}
