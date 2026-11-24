/**
 * The bearer check both entry points share.
 *
 * Run with `npm test` inside `mailer/`. No install, no network: `auth.mjs`
 * imports only `node:crypto`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { authorized } from '../src/auth.mjs';

const TOKEN = 'a'.repeat(64);

test('accepts the exact token behind a bearer prefix', () => {
  assert.equal(authorized(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(authorized(`bearer ${TOKEN}`, TOKEN), true);
  assert.equal(authorized(`BEARER  ${TOKEN}  `, TOKEN), true);
});

test('refuses anything else', () => {
  assert.equal(authorized('', TOKEN), false);
  assert.equal(authorized(undefined, TOKEN), false);
  assert.equal(authorized(TOKEN, TOKEN), false, 'the prefix is not optional');
  assert.equal(authorized('Bearer ', TOKEN), false);
  assert.equal(authorized('Bearer wrong', TOKEN), false);
  assert.equal(authorized(`Bearer ${TOKEN}x`, TOKEN), false);
});

test('refuses everything when no token is configured', () => {
  assert.equal(authorized('Bearer anything', ''), false);
  assert.equal(authorized('', ''), false);
});
