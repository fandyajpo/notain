import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

/**
 * Every in-page link in the marketing header and footers must land on a section
 * the landing page actually renders.
 *
 * The landing's sections have been renamed and deleted before, and a link left
 * pointing at a section that no longer exists does not 404: it scrolls nowhere,
 * which reads as a broken page rather than a broken link.
 */

/** The files a reader clicks. */
const LINK_SOURCES = [
  'src/lib/site-nav.ts',
  'src/components/react/landing/site-footer.tsx',
  'src/components/ui/SiteFooter.astro',
];

const LANDING_DIR = 'src/components/react/landing';

/** `#fff` is a colour, not a section. */
const HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('landing anchors', () => {
  it('has a section for every in-page link in the header and footers', () => {
    const landing = readdirSync(join(process.cwd(), LANDING_DIR))
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => read(join(LANDING_DIR, file)))
      .join('\n');

    const ids = new Set(
      (landing.match(/id="[a-z][a-z0-9-]*"/g) ?? []).map((match) => match.slice(4, -1)),
    );

    const anchors = new Set<string>();
    for (const path of LINK_SOURCES) {
      for (const match of read(path).match(/#[a-z][a-z0-9-]*/g) ?? []) {
        const anchor = match.slice(1);
        if (!HEX.test(anchor)) anchors.add(anchor);
      }
    }

    expect(anchors.size).toBeGreaterThan(0);
    expect([...anchors].filter((anchor) => !ids.has(anchor))).toEqual([]);
  });
});
