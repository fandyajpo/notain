/**
 * The one credential check both entry points share.
 *
 * Constant-time comparison: a wrong token must cost the same as any other wrong
 * token, and hashing first keeps both buffers the same length —
 * `timingSafeEqual` throws on a length mismatch, and comparing lengths first
 * would leak the token's length.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export function authorized(header, expected) {
  const raw =
    typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : '';
  if (raw === '' || expected === '') return false;
  const provided = createHash('sha256').update(raw).digest();
  const required = createHash('sha256').update(expected).digest();
  return timingSafeEqual(provided, required);
}
