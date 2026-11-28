import { describe, expect, it } from 'vite-plus/test';

/**
 * Every in-page link in the marketing header and footers must land on a section
 * the landing page actually renders.
 *
 * The landing's sections have been renamed and deleted before, and a link left
 * pointing at a section that no longer exists does not 404: it scrolls nowhere,
 * which reads as a broken page rather than a broken link.
 *
 * The sources are read as text through Vite's `?raw` imports rather than
 * `node:fs`. This project ships no `@types/node` — deliberately, since nothing
 * in `src/` or `functions/` runs on Node — so a test that reaches for
 * `readFileSync` or `process` cannot typecheck under the same `tsconfig.json`
 * the app builds with, and `npm run lint` fails on it.
 */

/** `#fff` is a colour, not a section. */
const HEX = /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/**
 * Vite types `import.meta.glob` from its options, and the overloads that return
 * strings have moved between versions; this asks only for "these are the source
 * texts", which is all the test needs.
 */
function readSources(modules: unknown): string {
  return Object.values(modules as Record<string, string>).join('\n');
}

describe('landing anchors', () => {
  it('has a section for every in-page link in the header and footers', () => {
    const landing = readSources(
      import.meta.glob('../src/components/react/landing/*.tsx', {
        query: '?raw',
        import: 'default',
        eager: true,
      }),
    );

    /** The files a reader clicks: the header's nav list and both footers. */
    const links = readSources(
      import.meta.glob(
        [
          '../src/lib/site-nav.ts',
          '../src/components/react/landing/site-footer.tsx',
          '../src/components/ui/SiteFooter.astro',
        ],
        { query: '?raw', import: 'default', eager: true },
      ),
    );

    const ids = new Set(
      (landing.match(/id="[a-z][a-z0-9-]*"/g) ?? []).map((match) => match.slice(4, -1)),
    );

    const anchors = new Set<string>();
    for (const match of links.match(/#[a-z][a-z0-9-]*/g) ?? []) {
      const anchor = match.slice(1);
      if (!HEX.test(anchor)) anchors.add(anchor);
    }

    expect(anchors.size).toBeGreaterThan(0);
    expect([...anchors].filter((anchor) => !ids.has(anchor))).toEqual([]);
  });
});
