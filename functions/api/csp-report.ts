import { apiError } from '../_lib/http';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * Browsers batch reports and some of them pad the body, so a few kilobytes is
 * the whole report; anything larger is not a browser.
 */
const MAX_BODY_BYTES = 8_192;

interface CspReport {
  'document-uri'?: string;
  'effective-directive'?: string;
  'violated-directive'?: string;
  'blocked-uri'?: string;
  'source-file'?: string;
  'line-number'?: number | string;
  'status-code'?: number | string;
}

/**
 * `POST /api/csp-report` — collect Content-Security-Policy violations.
 *
 * The site sends its CSP as Content-Security-Policy-Report-Only (see
 * `public/_headers`), so nothing is blocked yet: the browser only reports what
 * *would* have been blocked. This Function is where those reports land, which
 * makes "does this policy break sign-in?" a question the logs can answer
 * before the policy is flipped to enforcing.
 *
 * It always answers 204 on a readable report — a report endpoint that errors
 * makes browsers drop reporting. Reports arrive without credentials from any
 * visitor, so the only real concern is log spam: the body is size-capped and
 * logged as one compact line, and Cloudflare's own log limits apply.
 */
export const onRequest: PagesFunction<Env> = async ({ request }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (text.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  // Chrome and Firefox post `{ "csp-report": {...} }`; newer specs and Safari
  // variants use `csp-violation`, and some send the report object bare. Take
  // whichever shape shows up rather than dropping the report on a rename.
  let report: CspReport | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    const body =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const candidate = body['csp-report'] ?? body['csp-violation'] ?? body;
    if (typeof candidate === 'object' && candidate !== null) {
      report = candidate as CspReport;
    }
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!report) {
    return new Response(null, { status: 400 });
  }

  const directive = report['effective-directive'] ?? report['violated-directive'] ?? 'unknown';
  const blocked = report['blocked-uri'] ?? 'unknown';
  const source = report['source-file'] ?? 'unknown';
  const line = report['line-number'] ?? '?';
  const documentUri = report['document-uri'] ?? 'unknown';
  console.log(
    `[csp] ${String(directive)} blocked ${String(blocked)} at ${String(source)}:${String(line)} on ${String(documentUri)}`,
  );

  return new Response(null, { status: 204 });
};
