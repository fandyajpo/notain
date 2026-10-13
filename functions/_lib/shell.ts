import type { Env } from './types';

/**
 * Answers with one of the built files, under whatever URL the browser asked
 * for.
 *
 * The shell is the only asset behind `/invoice/<id>`, so the address bar keeps
 * showing the id while the document served is the edit page. Nothing here
 * redirects: a redirect would put the query string back in the URL, which is
 * the exact thing these routes exist to avoid.
 */
export function serveShell(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  return env.ASSETS.fetch(new Request(new URL(path, request.url), { method }));
}
