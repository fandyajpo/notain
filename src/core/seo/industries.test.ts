import { describe, expect, it } from 'vite-plus/test';
import { INDUSTRY_PAGES, INDUSTRY_SLUGS, getIndustryPage } from './industries';
import { isIndexable } from '../../lib/seo';

/**
 * The SEO cluster's contract: eight pages, each one indexable (route on the
 * allowlist), each one shaped like a real landing page, and its metadata
 * inside the lengths a search result actually shows.
 */

const EXPECTED_SLUGS = [
  'katering',
  'desainer',
  'developer',
  'warung',
  'online-shop',
  'freelancer',
  'jasa-servis',
  'salon',
];

describe('INDUSTRY_PAGES', () => {
  it('ships exactly the eight requested industries', () => {
    expect(INDUSTRY_SLUGS).toEqual(EXPECTED_SLUGS);
    expect(getIndustryPage('katering')?.label).toBe('Katering');
    expect(getIndustryPage('tidak-ada')).toBeUndefined();
    expect(getIndustryPage(undefined)).toBeUndefined();
  });

  it('lists every slug as an indexable route', () => {
    for (const slug of INDUSTRY_SLUGS) {
      expect(isIndexable(`/${slug}/`), slug).toBe(true);
    }
  });

  it('keeps titles and descriptions inside search-result lengths', () => {
    for (const page of INDUSTRY_PAGES) {
      expect(page.title.length, page.slug).toBeLessThanOrEqual(70);
      expect(page.title.endsWith('| Notain'), page.slug).toBe(true);
      expect(page.description.length, page.slug).toBeGreaterThanOrEqual(70);
      expect(page.description.length, page.slug).toBeLessThanOrEqual(165);
      expect(page.h1.length, page.slug).toBeGreaterThan(10);
    }
  });

  it('gives every page distinct metadata (no doorway-page duplicates)', () => {
    const titles = INDUSTRY_PAGES.map((page) => page.title);
    const descriptions = INDUSTRY_PAGES.map((page) => page.description);
    const h1s = INDUSTRY_PAGES.map((page) => page.h1);
    expect(new Set(titles).size).toBe(INDUSTRY_PAGES.length);
    expect(new Set(descriptions).size).toBe(INDUSTRY_PAGES.length);
    expect(new Set(h1s).size).toBe(INDUSTRY_PAGES.length);
  });

  it('fills every section of every page', () => {
    for (const page of INDUSTRY_PAGES) {
      expect(page.features, page.slug).toHaveLength(3);
      expect(page.workflow, page.slug).toHaveLength(3);
      expect(page.exampleLines.length, page.slug).toBeGreaterThanOrEqual(2);
      expect(page.exampleNote, page.slug).toBeTruthy();
      expect(page.pain.length, page.slug).toBeGreaterThan(50);
      expect(page.faq.length, page.slug).toBeGreaterThanOrEqual(3);
      for (const item of page.faq) {
        expect(item.question, page.slug).toBeTruthy();
        expect(item.answer.length, page.slug).toBeGreaterThan(30);
      }
      for (const feature of page.features) {
        expect(feature.title, page.slug).toBeTruthy();
        expect(feature.body, page.slug).toBeTruthy();
      }
    }
  });
});
