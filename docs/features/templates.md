# Templates

How an invoice's appearance is defined, edited, resolved and kept valid. The
business rules live in `src/core/template/`; the editor is React.

## Model

A template (`src/core/template/model.ts`) is:

- `name` — ≤128 characters.
- `layout` — an ordered array of blocks, at most 40. Each block has `id`,
  `type`, `visible`, `align` (`left`/`center`/`right`) and `width`
  (`full`/`wide`/`narrow`). Block types: `letterhead`, `richHeader`,
  `customer`, `items`, `richContent`, `totals`, `notes`, `richFooter`,
  `divider`, `spacer`.
- `theme` — every colour the preview reads, applied as CSS custom properties:
  `background`, `surface`, `text`, `muted`, `border`, `accent`,
  `accentForeground`, `accentSoft`, `radius`, `accentBar`, and a `wallpaper`
  (none, solid, or a two-colour gradient with an angle).
- `defaults` — `header`, `content`, `footer` rich text (≤20,000 each) and
  optional `notes` (≤5,000), used to seed a new invoice.
- `businessType` — a taxonomy slug, or `null` for "any type".
- `builtin` — true only for the three code-defined templates.

`DEFAULT_THEME` matches the app's design tokens, so an untouched template looks
native.

## Built-in templates

`classic` (Klasik), `minimal` (Minimal) and `modern` (Modern) live in
`src/core/template/builtins.ts` and are never persisted. They are always
selectable, even with an empty templates table, and they are the fallback when a
saved template disappears. `minimal` overrides the accent to near-black and a
6 px radius; `modern` uses a 4 px radius and the accent bar.

## Resolution rules

`resolveTemplate(id, saved)`:

- a saved template whose layout still has the required blocks wins — editing a
  template changes every invoice that points at it, because invoices store a
  reference, not a snapshot;
- otherwise a built-in with that id;
- otherwise `FALLBACK_TEMPLATE` (`classic`).

`listSelectableTemplates(saved)` returns built-ins first, then saved templates
whose layout is still usable. A rotted template is hidden rather than offered,
because picking it would produce an invoice with no line items.

`groupTemplatesForBusiness(templates, businessType)` splits the picker into
"for your business type" and everything else. Grouping never hides: built-ins
and other trades' templates stay one section away, and with no chosen type the
whole list is returned as `others`.

## Layout rules

`src/core/template/layout.ts` is the only place that decides whether a layout
may change. Every function is pure, returns the input array unchanged for a
no-op (so React does not re-render and the form is not marked dirty), and is
unit tested (18 tests).

- `letterhead`, `items` and `totals` are required: they cannot be removed or
  hidden if they are the last visible block of their type.
- A hidden block can always be removed; an optional block can always be removed.
- `maxBlocks` (40) refuses a new block.
- Reordering is by index with out-of-range indices as a no-op; the up/down
  buttons step one position and clamp at both ends.
- `restoreRequiredBlocks` returns a layout with every required type visible,
  unhiding an existing block before appending a new one.

The editor uses native HTML5 drag and drop plus arrow buttons, so it works with
a keyboard and on touch without a drag-and-drop library (ADR 0002).

## Editing flow

Routes: `/templates` (list), `/templates/new` (blank editor or a copy of a
built-in via `?from=`), `/templates/<id>` (edit). Both editor URLs serve the
same static shell (`dist/templates/new/`) through
`functions/templates/[[id]].ts`; `/templates/edit` redirects to the canonical
URL. `templateEditorTargetFromLocation` reads the address bar to decide which
mode to open.

The editor (`template-edit-app.tsx`) has three areas:

- **Blocks** (`block-list.tsx`): reorder, show/hide, remove, add from the
  palette, change alignment and width. Required-block actions are disabled, not
  hidden, so the rule is visible.
- **Theme** (`theme-form.tsx`): colour inputs, radius, accent bar, wallpaper.
- **Defaults** (`defaults-form.tsx`): the rich text a new invoice inherits.

Validation uses `invoiceTemplateSchema`. Save creates or patches the row through
`/api/data/templates`; delete removes it. Deleting a template that invoices still
reference is allowed — those invoices fall back to a built-in at render time.

The `/templates` grid is paginated separately from the full list the picker
reads (`queryKeys.templates` versus `queryKeys.templatesPage`), and an editor
save invalidates both.

## What a template does to a new invoice

Selecting a template seeds a draft:

- default rich text fills sections that are still empty, never overwriting typed
  content;
- sample items come from the business preset for the organization's type when
  one exists;
- switching templates later keeps typed content (ADR 0003 describes why the
  picker is derived from history and presets rather than from the template).

`src/core/template/apply.ts` and `seed.ts` hold the pure helpers that do this,
with unit tests.

## Business types

`src/core/business/taxonomy.ts` defines 19 categories and 175 subtypes. Only the
subtype slug is stored — on `profiles.businessType`, `templates.businessType`
and `organizations.businessType`. The category exists only to group the picker.

`src/core/business/presets.ts` holds per-category content: default prose, sample
items, layout recipes and unit suggestions, all as code rather than stored data.
`src/core/business/detail-fields.ts` catalogues which extra invoice fields a
type shows (vehicle name and plate for a workshop, weight for a laundry), with
per-subtype overrides; the values are stored per invoice in `details`.

An unknown or retired slug degrades to "no business type" on read rather than
throwing, and the org endpoints validate slugs on the way in and out.

## Failure modes

- Invalid name, layout or theme → 400 with a field-mapped message.
- An organizationless account is limited to the built-in templates in the UI;
  a custom-template write requires an organization because the table is
  org-scoped.
- Foreign or missing template row → 404 on read, silently absent from the
  picker.
- A concurrent update is expected to surface as a conflict rather than a silent
  overwrite; the admin content tools implement fingerprint-based conflict
  detection, the user-facing editor relies on the last write winning within one
  session.
- A saved template whose layout lost a required block is hidden from the picker
  and never resolved onto an invoice.

## Files

- Rules and data: `src/core/template/{model,layout,builtins,resolve,schema,apply,seed,repair}.ts`.
- Editor: `src/components/react/template/*` and the invoice builder's picker.
- Server: `/api/data/templates` (org-scoped CRUD), `/api/admin/content`
  (admin editing).
- Persistence: `templates` table, `layout` and `theme` as JSON columns
  (`data-model.md`).
