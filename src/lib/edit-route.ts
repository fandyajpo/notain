/**
 * Reading a resource id out of the address bar.
 *
 * The site ships as static HTML, so there is no server route behind
 * `/invoice/<id>`: a Pages Function in production (and a dev-server middleware
 * while developing) hands the browser the edit page's shell and leaves the
 * address bar alone. The id therefore comes from whichever of the two places
 * it is written — the path for the new links, `?id=` for the ones that already
 * exist — and the app has to accept both.
 *
 * The pattern and the reserved segments are shared with
 * `functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts` and the dev
 * middleware in `astro.config.mjs`: whoever decides "this segment is an id"
 * has to agree with whoever serves the page for it.
 */

/** One path segment: Appwrite ids, safe to also drop straight into a URL. */
export const ID_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Segments under `/invoice/` that are routes of their own, never an id. */
export const INVOICE_RESERVED_SEGMENTS: ReadonlySet<string> = new Set(['new', 'print', 'edit']);

/** Same, for `/templates/`. */
export const TEMPLATE_RESERVED_SEGMENTS: ReadonlySet<string> = new Set(['new', 'edit']);

export interface PageLocation {
  readonly pathname: string;
  readonly search: string;
}

function readSearch(location: PageLocation, key: string): string | null {
  return new URLSearchParams(location.search).get(key);
}

/**
 * The single segment after `prefix`, if the path is exactly `<prefix>/<segment>`
 * (an optional trailing slash allowed). Anything deeper — `/invoice/a/b` — is
 * not an edit link and yields nothing.
 */
function segmentAfter(location: PageLocation, prefix: string, reserved: ReadonlySet<string>) {
  if (!location.pathname.startsWith(`${prefix}/`)) return undefined;
  // One segment, optional trailing slash; anything deeper is not an edit link.
  const rest = location.pathname.slice(prefix.length + 1).replace(/\/+$/, '');
  if (!rest || rest.includes('/') || reserved.has(rest)) return undefined;
  return ID_SEGMENT_PATTERN.test(rest) ? rest : undefined;
}

/** The invoice being edited, from `/invoice/<id>` or the older `?id=` form. */
export function invoiceIdFromLocation(location: PageLocation): string | undefined {
  const fromQuery = readSearch(location, 'id');
  if (
    fromQuery &&
    ID_SEGMENT_PATTERN.test(fromQuery) &&
    !INVOICE_RESERVED_SEGMENTS.has(fromQuery)
  ) {
    return fromQuery;
  }
  return segmentAfter(location, '/invoice', INVOICE_RESERVED_SEGMENTS);
}

export interface TemplateEditorTarget {
  /** The template being edited, if any — absent means "a new one". */
  id?: string | undefined;
  /** Built-in id to seed a copy from, from `?from=`. */
  seedId?: string | null;
}

/**
 * What the template editor should open: an existing template (`/templates/<id>`
 * or `?id=`), a copy of a built-in (`/templates/new?from=`), or a blank one.
 */
export function templateEditorTargetFromLocation(location: PageLocation): TemplateEditorTarget {
  const seedId = readSearch(location, 'from');
  const fromQuery = readSearch(location, 'id');
  const id =
    fromQuery && ID_SEGMENT_PATTERN.test(fromQuery) && !TEMPLATE_RESERVED_SEGMENTS.has(fromQuery)
      ? fromQuery
      : segmentAfter(location, '/templates', TEMPLATE_RESERVED_SEGMENTS);
  return { id, seedId };
}
