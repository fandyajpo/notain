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

/**
 * `/site/` has no reserved segments: every valid segment under it is an
 * owner id, and the bare `/site` shell is served without one.
 */
const SITE_RESERVED_SEGMENTS: ReadonlySet<string> = new Set();

/**
 * A query-string id that could name a real resource, i.e. one the app would
 * treat as an id rather than a reserved segment. Used both to read the address
 * bar and to fold the older `?id=` links onto the canonical route.
 */
function validIdParam(value: string | null, reserved: ReadonlySet<string>): string | undefined {
  if (!value || reserved.has(value) || !ID_SEGMENT_PATTERN.test(value)) return undefined;
  return value;
}

/**
 * Where the older `/invoice/edit?id=…` link should land now that every invoice
 * has a URL of its own. Without a usable id there is no target — the shell
 * still answers and the app explains that the link is incomplete.
 */
export function invoiceEditCanonicalTarget(search: string): string | undefined {
  const id = validIdParam(new URLSearchParams(search).get('id'), INVOICE_RESERVED_SEGMENTS);
  return id ? `/invoice/${id}` : undefined;
}

/**
 * Where the older `/templates/edit` link should land. That segment is no
 * longer a page of its own, so every request for it moves: the id wins, then
 * a built-in to copy (`?from=`), and otherwise the blank editor.
 */
export function templateEditCanonicalTarget(search: string): string {
  const params = new URLSearchParams(search);
  const id = validIdParam(params.get('id'), TEMPLATE_RESERVED_SEGMENTS);
  if (id) return `/templates/${id}`;
  const from = params.get('from');
  if (from) return `/templates/new?${new URLSearchParams({ from })}`;
  return '/templates/new';
}

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

/**
 * The owner whose public business page this is: `/site/<ownerId>`.
 *
 * The owner id doubles as the capability credential (see
 * `functions/api/site/[id].ts`), so unlike the editor routes there is no
 * `?id=` fallback — the path is the only address the page has.
 */
export function siteIdFromLocation(location: PageLocation): string | undefined {
  return segmentAfter(location, '/site', SITE_RESERVED_SEGMENTS);
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

/**
 * The invoice the public print/share link names: `/invoice/print/<id>`.
 *
 * The bare `/invoice/print` is the signed-in print view (a draft handed over
 * through `sessionStorage`) and has no id — only the two-segment path carries
 * a capability link the owner sends to a customer.
 */
export function printInvoiceIdFromLocation(location: PageLocation): string | undefined {
  return segmentAfter(location, '/invoice/print', INVOICE_RESERVED_SEGMENTS);
}

/**
 * Whether `pathname` carries the invoice builder — `/invoice/new`,
 * `/invoice/<id>`, or the legacy `/invoice/edit` — as opposed to the list
 * (`/invoices`) or the print views (`/invoice/print` and
 * `/invoice/print/<id>`, which render the document, not the form). Drives
 * which shortcut groups the `?` overlay lists: the builder's hotkeys only
 * exist where the builder is mounted.
 */
export function isInvoiceBuilderPath(pathname: string): boolean {
  if (!pathname.startsWith('/invoice/')) return false;
  const rest = pathname.slice('/invoice/'.length).replace(/\/+$/, '');
  // `print/<id>` also starts with "print", so the prefix check runs first —
  // without it the public print link would mount the builder's hotkeys.
  if (rest.startsWith('print/')) return false;
  return rest.length > 0 && rest !== 'print';
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
