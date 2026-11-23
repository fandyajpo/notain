/**
 * Configuration resolution, including the Gmail shortcuts.
 *
 * Run with `npm test` inside `mailer/`. Nothing here touches the network or the
 * native addon, so these pass before `npm install`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, isGoogleAccount, loadConfig } from '../src/config.mjs';

/** A minimal valid environment; each test overrides one or two keys. */
function baseEnv(overrides = {}) {
  return {
    SMTP_USER: 'you@gmail.com',
    SMTP_PASS: 'abcd efgh ijkl mnop',
    MAIL_SERVICE_TOKEN: 'x'.repeat(32),
    ...overrides,
  };
}

test('isGoogleAccount recognises the domains Google hosts', () => {
  assert.equal(isGoogleAccount('you@gmail.com'), true);
  assert.equal(isGoogleAccount('You@GoogleMail.com'), true);
  assert.equal(isGoogleAccount('you@mycompany.com'), false);
  assert.equal(isGoogleAccount(''), false);
});

test('a Gmail account needs only user and pass', () => {
  const config = loadConfig(baseEnv());

  assert.deepEqual(config.smtp, {
    host: 'smtp.gmail.com',
    port: 465,
    secure: 'tls',
    auth: { user: 'you@gmail.com', pass: 'abcdefghijklmnop' },
  });
  // Google shows app passwords in groups; the spaces are stripped for you.
  assert.equal(config.smtp.auth.pass, 'abcdefghijklmnop');
  // From defaults to the authenticated account.
  assert.equal(config.from.email, 'you@gmail.com');
  assert.deepEqual(config.warnings, []);
});

test('MAIL_FROM still wins over the default', () => {
  const config = loadConfig(baseEnv({ MAIL_FROM: 'halo@mycompany.com' }));
  assert.equal(config.from.email, 'halo@mycompany.com');
  // A different domain than the Google account is worth a warning, not a stop.
  assert.equal(config.warnings.length, 1);
});

test('a Workspace address needs SMTP_HOST because it cannot be inferred', () => {
  assert.throws(
    () => loadConfig(baseEnv({ SMTP_USER: 'halo@mycompany.com', SMTP_PASS: 'secret' })),
    ConfigError,
  );

  const config = loadConfig(
    baseEnv({ SMTP_USER: 'halo@mycompany.com', SMTP_PASS: 'secret', SMTP_HOST: 'smtp.gmail.com' }),
  );
  assert.equal(config.smtp.host, 'smtp.gmail.com');
  assert.equal(config.from.email, 'halo@mycompany.com');
});

test('port 587 implies STARTTLS', () => {
  const config = loadConfig(baseEnv({ SMTP_PORT: '587' }));
  assert.equal(config.smtp.port, 587);
  assert.equal(config.smtp.secure, 'starttls');
});

test('a bad password shape starts, but says why it will fail', () => {
  const config = loadConfig(baseEnv({ SMTP_PASS: 'my-normal-password' }));
  assert.equal(config.warnings.length, 1);
  assert.match(config.warnings[0], /16 karakter/);
});

test('Google refuses to boot without an app password', () => {
  assert.throws(() => loadConfig(baseEnv({ SMTP_PASS: '' })), ConfigError);
});

test('an unauthenticated relay still needs a host and a sender', () => {
  assert.throws(
    () => loadConfig({ MAIL_SERVICE_TOKEN: 'x'.repeat(32), MAIL_FROM: 'a@b.co' }),
    ConfigError,
  );

  const config = loadConfig({
    MAIL_SERVICE_TOKEN: 'x'.repeat(32),
    MAIL_FROM: 'a@b.co',
    SMTP_HOST: 'relay.internal.test',
  });
  assert.equal(config.smtp.auth, null);
  assert.equal(config.from.email, 'a@b.co');
});

test('half an auth pair is always a mistake', () => {
  assert.throws(() => loadConfig(baseEnv({ SMTP_PASS: '' })), ConfigError);
  assert.throws(
    () => loadConfig({ SMTP_PASS: 'secret', MAIL_FROM: 'a@b.co', SMTP_HOST: 'smtp.example.test' }),
    ConfigError,
  );
});

test('the shared token is required for the HTTP entry point only', () => {
  assert.throws(() => loadConfig(baseEnv({ MAIL_SERVICE_TOKEN: '' })), ConfigError);

  const functionMode = loadConfig(baseEnv({ MAIL_SERVICE_TOKEN: '' }), {
    requireServiceToken: false,
  });
  assert.equal(functionMode.serviceToken, '');
});
