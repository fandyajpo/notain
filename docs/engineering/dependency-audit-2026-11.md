# Dependency audit — 2026-11

What every package in `package.json` and `mailer/package.json` is for, whether it
is lazily loaded, what it costs, and what can leave. The goal is fewer libraries
without losing a feature, and no slower first paint. Nothing was measured on the
authoring machine (it cannot build this project); the weights named below are the
contributions the libraries themselves document, and `docs/architecture/bundle.md`
holds the measured chunks.

## What the tree already does well

- **Lazy, not deferred and not eager**: SheetJS (`lib/excel.ts` calls
  `import('xlsx')`), HEIC decoding (`import('heic2any')` in
  `lib/payment-proof.ts`), TipTap (`React.lazy` in `lazy-rich-editor.tsx`) and
  three of the four island runtimes (`use-ce-element.ts` registers them
  dynamically). None of it is in a page's initial payload.
- **CSV never touches SheetJS** (ADR 0002): `core/excel/csv.ts` is written by
  hand, so the common export costs nothing.
- **The Vue runtime compiler is aliased out** of `astro.config.mjs`, for CSP
  (`new Function`) and for weight.
- **No unused import survives**: `noUnusedLocals`, `no-unused-vars` at error level,
  and CI runs both.

## Removed in this pass

`jspdf` and `jspdf-autotable` — `src/lib/pdf.ts` (97 lines) rendered the sheet
PDF with them, lazily, for one button. The export now opens the browser's print
dialog with a plain HTML table (`src/lib/sheet-print.ts`, 92 lines, plus
`sheet-print.test.ts`), which is the path ADR 0007 already chose for an invoice
and the only path this project keeps. Two packages and a ~390 kB chunk leave the
build; the reader's experience is the same, "PDF" then *Save as PDF* in the dialog.

The declarations in `package.json` and `package-lock.json` still list both, because
keeping a lockfile in sync needs npm and there is no terminal here — nothing
imports them, so the build no longer contains them. On a machine with npm:
`npm uninstall jspdf jspdf-autotable`.

## Every runtime dependency

| Package | Imported where | Lazy | Verdict |
| :--- | :--- | :--- | :--- |
| `astro` | the whole site | — | keep |
| `@astrojs/react`, `@astrojs/vue`, `@astrojs/svelte`, `@astrojs/solid-js`, `react`, `react-dom`, `vue`, `svelte`, `solid-js` | the four island runtimes the probes exist to demonstrate (ADR 0001, 0004) | three of them, dynamically | keep — this is the product, not overhead |
| `tailwindcss`, `@tailwindcss/vite` | `src/styles/global.css` | — | keep |
| `appwrite` | `src/appwrite/client.ts` (session, JWT minting) | — | keep |
| `zod` | `core/*/schema.ts`, form validation | — | keep |
| `@tanstack/react-query` | the single query layer (ADR 0006) | — | keep |
| `@tanstack/react-form` | invoice, customer and settings forms | — | keep |
| `@tanstack/react-table` | `dashboard/invoice-table.tsx` | — | keep (a sorting/selection table is not worth hand-writing) |
| `@tanstack/markdown` | `invoice/invoice-preview.tsx` | — | keep (same reasoning) |
| `@tanstack/react-hotkeys` | `invoice/invoice-builder.tsx` | — | candidate (one file; a ~30-line hook covers it) |
| `@tanstack/react-pacer` | `invoice-builder.tsx`, `invoice-table.tsx` | — | candidate (debounce in ~10 lines) |
| `@tanstack/react-store` | `invoice-builder`, `builder-tabs`, `shortcuts`, `template-edit-app` | — | candidate (`useSyncExternalStore`) |
| `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder` | `invoice/rich-editor.tsx` | yes | keep |
| `lucide-react` | most islands | — | keep |
| `@lucide/astro` | `ui/SiteHeader.astro` (2 icons) | — | candidate — inline SVG, 1 package |
| `@lucide/svelte` | `svelte/ItemsGrid.svelte` (5 icons) | — | candidate — inline SVG, 1 package |
| `motion` | four landing sections | — | candidate — CSS transitions |
| `driver.js` | `lib/tour/tour-manager.ts` | — | candidate — `global.css` already restyles its popover |
| `heic2any` | `lib/payment-proof.ts` | yes (1.3 MB) | candidate — see below |
| `xlsx` | `lib/excel.ts` | yes (~480 kB) | keep; DEP-001 (CDN tarball, no integrity) still open |

Dev dependencies that nothing imports: `globals` (the lint config declares its
languages explicitly). Remove it with the next `npm install` that runs.

`mailer/` has one dependency, `@sendust/ts`, and it is the only place a native
addon can run; nothing to save there.

## Ranked next steps

1. **`heic2any`** — the single biggest chunk (1.3 MB) and the only one whose
   removal loses an input format. iPhone photos are HEIC by default, so dropping it
   means the proof upload accepts JPEG/PNG/WebP only and says so. Decide before
   doing: 1.3 MB on demand versus an iPhone user whose photo is refused.
2. **`driver.js` + `motion`** — two UI-only packages, ~60 kB together. Both
   rewrites are visual, and no test covers how they look, so they need a browser
   check rather than a CI pass.
3. **`@lucide/astro` + `@lucide/svelte`** — two packages for seven icons in two
   template files. Small weight, small effort, small visual risk (the icons would
   be copied from the set's own geometry).
4. **`@tanstack/react-hotkeys`, `react-pacer`, `react-store`** — three packages,
   each replaceable in 10–30 lines, all used where an interaction bug is
   expensive (autosave debounce, keyboard shortcuts, builder state).
5. The `globals` devDependency, with whichever of the above lands next, since a
   dependency change needs `npm install` to keep the lockfile honest.
