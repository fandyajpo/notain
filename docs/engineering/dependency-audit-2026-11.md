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
and the only path this project keeps. Two packages, a ~390 kB chunk and their
`node_modules` entries leave the build and the install; the reader's experience is
the same, "PDF" then *Save as PDF* in the dialog.

`globals` (a devDependency) — nothing imports it: `vite.config.ts` names the lint
environments (`builtin`, `browser`, `node`) instead of importing a `globals`
object. Its declaration is gone from both manifests, while its
`node_modules/globals` entry stays: `eslint-plugin-astro` requires it, so the
package is still installed once, for its real user.

Two lockfile entries are left orphaned by the removal — `fast-png` (only jsPDF
required it) and jsPDF's own optional dependencies. Nothing imports either, so
neither reaches the bundle; an `npm install` prunes their entries, and no npm
command has to run for the removal itself, because `npm ci` validates the lockfile
in the direction that matters here: every dependency in `package.json` is present
in the lock.

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

No `package.json` dependency is unused: every remaining declaration is imported
somewhere, and `globals` — the one that was not — has left both manifests.

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
3. **`@lucide/astro` + `@lucide/svelte` — kept on purpose.** Two packages for
   seven icons in two template files. Replacing them means this repository owns
   seven SVG paths the icon set would no longer maintain, for a build that is a
   few KB lighter at most (the imports are tree-shaken to the icons used). Fewer
   names in `package.json` is the only real gain, so it is not worth the upkeep.
4. **`@tanstack/react-hotkeys`, `react-pacer`, `react-store`** — three packages,
   each replaceable in 10–30 lines, all used where an interaction bug is
   expensive (autosave debounce, keyboard shortcuts, builder state).
