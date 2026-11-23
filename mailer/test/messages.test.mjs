/**
 * Message rendering and request validation, without a relay or a native addon.
 *
 * Run with `npm test` inside `mailer/` (Node's own test runner). The repo-level
 * `npm test` does not pick these up: it only globs `src/**` and `tests/**`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoiceMessage, passwordResetMessage, welcomeMessage } from '../src/messages.mjs';
import { formatDate, formatRupiah } from '../src/render.mjs';
import { handleSend, parseRequest } from '../src/service.mjs';

const CONFIG = { appName: 'Notain', logoUrl: '' };

test('formatRupiah groups thousands and never adds decimals', () => {
  assert.equal(formatRupiah(0), 'Rp0');
  assert.equal(formatRupiah(1_250_000), 'Rp1.250.000');
  assert.equal(formatRupiah(999.6), 'Rp1.000');
  assert.equal(formatRupiah(Number.NaN), 'Rp0');
});

test('formatDate renders an Indonesian date without shifting the day', () => {
  assert.equal(formatDate('2026-10-08'), '8 Oktober 2026');
  assert.equal(formatDate('2026-01-31T23:59:00Z'), '31 Januari 2026');
  assert.equal(formatDate(''), '');
  assert.equal(formatDate('not-a-date'), '');
});

test('every message carries an HTML and a text body', () => {
  const messages = [
    welcomeMessage({
      to: 'a@b.co',
      name: 'Budi',
      loginUrl: 'https://notain.pages.dev/login',
      ...CONFIG,
    }),
    passwordResetMessage({
      to: 'a@b.co',
      name: 'Budi',
      resetUrl: 'https://notain.pages.dev/reset-password?token=abc',
      ...CONFIG,
    }),
    invoiceMessage({
      to: 'a@b.co',
      customerName: 'Sari',
      invoiceNumber: 'INV-2026-014',
      businessName: 'Warung Sari',
      total: 250_000,
      date: '2026-11-08',
      invoiceUrl: 'https://notain.pages.dev/invoice/print/inv_1',
      ...CONFIG,
    }),
  ];

  for (const message of messages) {
    assert.ok(message.subject.length > 0);
    assert.ok(message.text.length > 0);
    assert.match(message.html, /^<!doctype html>/);
    // The plain-text half must never contain markup.
    assert.doesNotMatch(message.text, /<\w/);
  }
});

test('the invoice message prints the money and the link it was given', () => {
  const message = invoiceMessage({
    to: 'sari@email.com',
    customerName: 'Sari',
    invoiceNumber: 'INV-2026-014',
    businessName: 'Warung Sari',
    total: 1_250_000,
    date: '2026-11-08',
    dueDate: '2026-11-22',
    note: 'Terima kasih.',
    invoiceUrl: 'https://notain.pages.dev/invoice/print/inv_1',
    ...CONFIG,
  });

  assert.match(message.text, /Rp1\.250\.000/);
  assert.match(message.text, /8 November 2026/);
  assert.match(message.text, /22 November 2026/);
  assert.match(message.text, /https:\/\/notain\.pages\.dev\/invoice\/print\/inv_1/);
  assert.equal(message.subject, 'Nota INV-2026-014 dari Warung Sari');
});

test('user input is escaped in the HTML body', () => {
  const message = invoiceMessage({
    to: 'sari@email.com',
    customerName: '<script>alert(1)</script>',
    invoiceNumber: 'INV-1',
    businessName: 'A & B',
    total: 1,
    invoiceUrl: 'https://example.test/i/1',
    ...CONFIG,
  });

  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /A &amp; B/);
});

test('parseRequest accepts the three templates and rejects everything else', () => {
  assert.equal(parseRequest({ type: 'nope', to: 'a@b.co' }).ok, false);
  assert.equal(parseRequest({ type: 'welcome', to: 'not-an-email', loginUrl: 'https://x.test' }).ok, false);
  assert.equal(parseRequest({ type: 'welcome', to: 'a@b.co', loginUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(
    parseRequest({ type: 'password-reset', to: 'a@b.co', resetUrl: 'https://x.test/r?token=1' }).ok,
    true,
  );
  assert.equal(
    parseRequest({ type: 'invoice', to: 'a@b.co', invoiceUrl: 'https://x.test/i', total: 10 }).ok,
    false,
    'invoiceNumber is required',
  );
});

test('handleSend reports what the transport decided, never more', async () => {
  const payload = { type: 'welcome', to: 'a@b.co', loginUrl: 'https://x.test/login' };

  const accepted = await handleSend(payload, {
    config: CONFIG,
    deliver: async () => ({ status: 'accepted' }),
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { ok: true, status: 'accepted' });

  const rejected = await handleSend(payload, {
    config: CONFIG,
    deliver: async () => ({ status: 'rejected' }),
  });
  assert.equal(rejected.status, 502);

  const broken = await handleSend(payload, {
    config: CONFIG,
    deliver: async () => {
      throw new Error('relay down');
    },
  });
  assert.equal(broken.status, 502);
  assert.equal(broken.body.error, 'unavailable');

  const invalid = await handleSend({ type: 'nope' }, { config: CONFIG, deliver: async () => ({ status: 'accepted' }) });
  assert.equal(invalid.status, 400);
});
