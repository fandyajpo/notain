import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_REDIRECT,
  isSafeRedirectPath,
  isSelfRedirect,
  resolveRedirectTarget,
} from './redirect';

describe('isSafeRedirectPath', () => {
  it('accepts ordinary same-origin paths', () => {
    expect(isSafeRedirectPath('/dashboard')).toBe(true);
    expect(isSafeRedirectPath('/')).toBe(true);
    expect(isSafeRedirectPath('/invoice/edit?id=5')).toBe(true);
    // The newer edit routes carry the id in the path, no query at all.
    expect(isSafeRedirectPath('/invoice/6acc91d70002fd3e80b4')).toBe(true);
    expect(isSafeRedirectPath('/templates/tpl_123')).toBe(true);
    expect(isSafeRedirectPath('/settings')).toBe(true);
  });

  it('rejects protocol-relative URLs, which leave our origin entirely', () => {
    // `window.location.assign('//evil.com')` navigates off-site — the classic
    // open redirect used in credential-phishing links.
    expect(isSafeRedirectPath('//evil.com')).toBe(false);
    expect(isSafeRedirectPath('///evil.com')).toBe(false);
    expect(isSafeRedirectPath('//evil.com/path')).toBe(false);
  });

  it('rejects backslash variants browsers normalise to protocol-relative', () => {
    expect(isSafeRedirectPath('/\\evil.com')).toBe(false);
    expect(isSafeRedirectPath('/\\/evil.com')).toBe(false);
    expect(isSafeRedirectPath('/dashboard\\..\\..')).toBe(false);
  });

  it('rejects absolute and scheme-bearing values', () => {
    expect(isSafeRedirectPath('https://evil.com')).toBe(false);
    expect(isSafeRedirectPath('http://evil.com')).toBe(false);
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectPath('evil.com')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
  });
});

describe('resolveRedirectTarget', () => {
  it('uses a safe ?next= value', () => {
    expect(resolveRedirectTarget('?next=/invoice/edit%3Fid%3D5')).toBe('/invoice/edit?id=5');
    expect(resolveRedirectTarget('?next=/settings')).toBe('/settings');
  });

  it('falls back to the default when there is no query string', () => {
    expect(resolveRedirectTarget('')).toBe(DEFAULT_REDIRECT);
    expect(resolveRedirectTarget('?foo=bar')).toBe(DEFAULT_REDIRECT);
  });

  it('drops an unsafe ?next= instead of following it', () => {
    expect(resolveRedirectTarget('?next=//evil.com')).toBe(DEFAULT_REDIRECT);
    expect(resolveRedirectTarget('?next=/\\evil.com')).toBe(DEFAULT_REDIRECT);
    expect(resolveRedirectTarget('?next=https://evil.com')).toBe(DEFAULT_REDIRECT);
  });

  it('prefers a caller-supplied fallback over the default', () => {
    expect(resolveRedirectTarget('', '/login')).toBe('/login');
    expect(resolveRedirectTarget('?next=//evil.com', '/login')).toBe('/login');
  });

  it('treats a blank value as absent', () => {
    expect(resolveRedirectTarget('?next=%20%20')).toBe(DEFAULT_REDIRECT);
  });
});

describe('isSelfRedirect', () => {
  it('detects redirecting back to the page already being shown', () => {
    // Without this, `/login?next=/login` reloads forever once a session exists.
    expect(isSelfRedirect('/login', '/login')).toBe(true);
    expect(isSelfRedirect('/login?next=/login', '/login')).toBe(true);
  });

  it('allows navigating to a different page', () => {
    expect(isSelfRedirect('/dashboard', '/login')).toBe(false);
    expect(isSelfRedirect('/login', '/dashboard')).toBe(false);
  });

  it('fails closed on a value that cannot be parsed', () => {
    expect(isSelfRedirect('http://', '/login')).toBe(true);
  });
});
