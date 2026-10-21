import { describe, expect, it } from 'vite-plus/test';
import { isActiveSiteLink } from './site-nav';

describe('isActiveSiteLink', () => {
  it('lights a page link only on that page', () => {
    expect(isActiveSiteLink('/pricing', '/pricing')).toBe(true);
    expect(isActiveSiteLink('/pricing/', '/pricing')).toBe(true);
    expect(isActiveSiteLink('/', '/pricing')).toBe(false);
    expect(isActiveSiteLink('/blog', '/pricing')).toBe(false);
  });

  it('never lights anchor links — on the homepage they would all be active', () => {
    expect(isActiveSiteLink('/', '#faq')).toBe(false);
    expect(isActiveSiteLink('/', '/#faq')).toBe(false);
    expect(isActiveSiteLink('/pricing', '/#faq')).toBe(false);
  });

  it('ignores query strings and unrelated targets', () => {
    expect(isActiveSiteLink('/pricing?plan=pro', '/pricing')).toBe(false);
    expect(isActiveSiteLink('/pricing', '/pricing?plan=pro')).toBe(true);
    expect(isActiveSiteLink('/dashboard', '/register')).toBe(false);
  });

  it('treats the bare homepage as a page of its own', () => {
    expect(isActiveSiteLink('/', '/')).toBe(true);
    expect(isActiveSiteLink('/pricing', '/')).toBe(false);
  });
});
