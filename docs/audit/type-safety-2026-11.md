# Type-safety audit — 2026-11

What this pass checked, what it changed, and what it deliberately left. It follows
the same rule as the other audits in this folder: a claim is a configuration fact
or a read of a named file, never a commit message. Nothing was executed on the
authoring machine, so CI is the verification channel — the `deploy` job already
ran the tests and the typecheck on every push, and this pass adds a `lint` job.

## What the configuration already guarantees

- **`tsconfig.json`** extends `astro/tsconfigs/strict` and adds
  `noUncheckedIndexedAccess` (an index returns `T | undefined`, so a typo'd or
  out-of-range read is a compile error), `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `allowUnreachableCode: false`, `noUnusedLocals`
  and `noUnusedParameters`. Unreachable code and an unused local are errors, not
  comments.
- **`vite.config.ts`** makes `typescript/no-explicit-any`,
  `typescript/ban-ts-comment`, `no-unsafe-optional-chaining`,
  `no-unused-vars`, `no-empty`, `no-useless-catch`, `prefer-const` and the
  `astro/*` rules error-level, with `options.typeAware` and
  `options.typeCheck` on. Data from Appwrite arrives through `readJson` and the
  mappers as `unknown` and is narrowed per field with `typeof`.
- **Searches over the tree** found no `: any`, `as any`, `<any>`,
  `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`, `TODO`,
  `FIXME`, `XXX` or `HACK`. (The five `as any`-shaped matches are English
  prose in `docs/`. Comment markers were searched case-sensitively, because
  `RowToDomain` contains one.)
- **`console.log`** appears only in Node scripts (`scripts/`, `mailer/src/`),
  never in `src/`: the browser bundles carry no logging.

## Fixed in this pass

| # | Finding | Fix |
| :--- | :--- | :--- |
| TS-1 | `json()` and `noContent()` set no `X-Content-Type-Options`. `public/_headers` decorates static assets only, so every `/api/*` JSON answer shipped without `nosniff`. | `functions/_lib/http.ts` sets it as a default on both helpers; `tests/http-headers.test.ts` pins it. |
| TS-2 | `functions/api/admin/support/[id].ts` echoed the first 200 characters of the upstream body to the client, and answered a failed upstream write as `500 validation`. | The body goes to `console.error`; the client gets `503 unavailable` with generic copy, the pattern `functions/api/support.ts` and the other admin writes already use. |
| TS-3 | The same file parsed its body with a local `request.json().catch(…)` cast instead of the shared helper. | Uses `readJson`, so `functions/` has one body parser. |
| TS-4 | `functions/api/data/[resource].ts` cast a `branches` array to `unknown[]` and asserted `branches[0]` non-null, though `ListQuery.values` is already `unknown[]`. | The cast and the `!` are gone; the single-field case reuses its element. |
| TS-5 | `npm run lint` ran only on a developer machine, so a lint error could reach `main` while tests and typechecking stayed green. | A `lint` job runs `npx astro sync` and `npm run lint` in parallel with the deploy — see Remaining 3. |

## Dead code

- No unused local or parameter can survive: the compiler flags are errors and CI
  runs them.
- No unused **export** is machine-checked: the repository has no `knip` or
  `ts-prune`, and adding one is a dependency decision rather than a fix. The
  modules that looked like candidates were checked by searching for importers, and
  each is imported: `src/lib/pdf.ts` (`excel/export-buttons.tsx`),
  `src/core/excel/index.ts` (`src/lib/excel.ts`, the import screens),
  `src/app/data-api.ts` (all five Appwrite repositories),
  `src/app/finance.ts` (`use-dashboard-finance.ts`),
  `src/lib/payment-proof.ts` (`app/public-invoice.ts`) and
  `src/components/react/api-keys/api-keys-app.tsx`
  (`src/pages/api-keys.astro`).
- `src/components/dashboard/.gitkeep` and `src/components/react/ui/.gitkeep` are
  empty-directory markers, not code.
- `src/components/react/api-keys/*` is the placeholder screen at `/api-keys`. It
  is rendered on purpose — the Business plan advertises API keys that do not exist
  yet — and is documented as a placeholder in `features/billing-and-quota.md`.
  Deleting it would turn a documented gap into a 404.

## Casts kept, on purpose

Three `as unknown as` casts remain in production code, each with its reason next
to it:

- `src/components/shared/use-ce-element.ts:20` — assigning a property onto a
  custom element whose type has no index signature; the alternative is `any`.
- `src/lib/use-unsaved-changes-guard.ts:42` — `beforeunload`'s deprecated
  `returnValue`, which the `lib.dom` type for the handler no longer carries.
- `src/lib/pdf.ts:30` — the `jspdf-autotable` default/namespace interop in a
  dynamic import.

`tests/`, `e2e/` and `smoke/` use `as unknown as` to call a `PagesFunction` with
a hand-built context. That is scaffolding for the test, not shipped code, and it is
the one place the cast is the honest stand-in for the platform.

## Remaining, not fixed here

1. **`apiError(5xx, 'validation', …)` at 34 call sites.** A client that branches
   on `error` cannot tell an outage from bad input; every 5xx should be
   `unavailable`. It is 34 edits across 16 files whose tests assert the current
   shape — work to do with the suite in reach rather than blind.
2. **`normalizeStatus` is duplicated** (`functions/_lib/payment-settle.ts`,
   `functions/api/payments/portal.ts`) — QUAL-002. The divergence (`failed`) is
   deliberate in one of them; unifying it is a money-path change.
3. **`lint` is not a deploy gate.** The new job proves the tree on every push;
   making `deploy` depend on it (`needs: lint`) is one line to add once the job
   has been green on `main`.
4. **`npm run test:e2e` and `npm run smoke` are not in CI.** They need Appwrite
   credentials, a session and (for the browser suite) a running dev server, none of
   which the workflow has.
