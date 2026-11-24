# Development-experience audit — 2026-11

A pass over the whole tree with one question: **what makes the next change slow?**
Not "what is wrong with the product" (that is `CODEBASE_AUDIT.md` and
`audit/verification-2026-11.md`) and not "what is unsafe" — this pass looked at
the seams a developer has to walk through to change something, and at the places
where a step reports success without having done its job.

Nothing below was executed on the machine that wrote it. Findings marked **BUG**
are proven from source (the Appwrite REST contract is quoted from this
repository's own working code, `functions/_lib/rows.ts` and
`functions/_lib/appwrite.ts`); the fixes are code, and their verification steps
are at the end.

## 1. What was actually slow

Three things, in order of cost:

1. **Adding a column meant copying a 200-line file.** Nineteen scripts in
   `scripts/` held 3,900 lines; twelve of them were the same program with a
   different table spec — the same config read, the same API-key guard, the same
   `api()` helper with its 429 back-off, the same create-attribute/create-index
   loop, the same dry-run gate. Adding one column to one table started with
   `cp scripts/ensure-stats.mjs scripts/ensure-whatever.mjs`.
2. **Setting up an environment was eleven commands in a fixed order**, each with
   its own dry-run-then-`--yes` dance, documented in three places that had
   already drifted from each other.
3. **Some of those steps silently did nothing.** The expensive version of a slow
   step is one you have to debug after it prints `✔`, which is what findings
   S-3 and S-4 below were doing.

## 2. Findings

| ID   | Sev    | Conf      | Finding                                                                                                                                                                                                                                                                                                                       |
| ---- | ------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1  | HIGH   | CONFIRMED | **Nineteen scripts, one program.** Twelve `ensure-*.mjs` files differed only in their table spec (~2,600 duplicated lines), and the `api()` helper was byte-identical in all of them. Every fix had to be made nineteen times, and was not: see S-2/S-3.                                                                          |
| S-2  | MEDIUM | BUG       | **`retry-after` read as milliseconds.** `ensure-business-type.mjs:88`, `ensure-payment-proof.mjs:81` and `harden-profile-permissions.mjs:94` wrote `? retryAfter : 2000 * attempt`, so a server-requested 2-second back-off became 2 ms — the retry fired immediately and burned an attempt. The other 16 copies had the `* 1000` and were right. |
| S-3  | HIGH   | BUG       | **Cursor pagination that Appwrite ignores.** `migrate-org-identity.mjs:107` and `harden-profile-permissions.mjs:128` sent `cursorAfter` as a plain URL parameter; cursor paging is a *query* (`functions/_lib/appwrite.ts:113`, `querySearchAll`), so the parameter is discarded and every page is page one. Both walked with `for (;;)` and broke only when a page came back short — i.e. **an infinite loop on any collection that fills one page** (100 profiles), and a silent no-op below that. `migrate-invoice-status.mjs:94` had a third spelling (bare `0=`/`1=` keys, also discarded), which capped its scan at the default page size — the `--backfill-sent` migration only ever saw the first ~25 invoices. |
| S-4  | HIGH   | BUG       | **A backfill that could never write.** `migrate-org-identity.mjs:161` PATCHed `{ name, businessType }` at the top level. Appwrite's update endpoint requires the payload under `data` and answers `document_missing_payload` otherwise — the repository's own comment says so (`functions/_lib/rows.ts:242`). The script therefore reported progress and changed nothing, which is the worst possible failure mode for a migration.                          |
| S-5  | HIGH   | BUG       | **Five tables created without row security.** `ensure-orgs`, `ensure-payments`, `ensure-audit`, `ensure-support` and `ensure-password-resets` created tables with `rowSecurity: true`, which Appwrite silently ignores; the current field is `documentSecurity` (the two `ensure-*` scripts that got it right say so in a comment: `ensure-catalog.mjs:146`). On the live project the tables exist and are fine, but a **fresh** environment would have had document security off — every row permission ignored, every list answering `401 user_unauthorized`.                          |
| S-6  | MEDIUM | CONFIRMED | **The documented order re-granted a permission the tenancy pass removes.** `ensure-catalog`/`ensure-stats` re-assert table permissions `['create("users")']` on every run, while `ensure-org-columns` (step 2 of the documented order) empties that permission (step 6 would put it back). After multi-tenancy, every tenant write goes through `/api/data/*` with the API key, so `[]` is correct and `['create("users")']` is a client write path the tenancy design deliberately removed.                                                                                              |
| S-7  | MEDIUM | CONFIRMED | **The provisioning order lived in three places** (`data-model.md`, `operations.md`, `architecture/README.md`) and each listed a slightly different set of commands. A new environment could not be set up from one document.                                                                                                                                                                                                                                   |
| S-8  | LOW    | CONFIRMED | **Nine documents named npm scripts that no longer existed** (or existed under another name), including `data-model.md`'s ten-step order and `features/email.md`'s reset-table step.                                                                                                                                                                                                                                                                            |
| S-9  | LOW    | CONFIRMED | **`AGENTS.md` listed three deploy secrets**; the workflow reads a fourth (`MAIL_SERVICE_TOKEN`). Unset is a supported state, but the symptom is silent — every `/api/mail/*` answers 503 and nothing else complains.                                                                                                                                                                                                                                          |

### What was healthy, for contrast

Worth recording so the next pass does not re-litigate it: the Functions layer is
genuinely disciplined (fail-closed gates, `no-store` by default, deadline-bounded
fetches, typed retries, a real circuit breaker), the build is reproducible from
`npm ci`, CI applies formatting instead of failing on it, and the test suite runs
fully offline. **None of this pass's findings touch request handling** — they are
all in tooling, plus the documentation that describes it.

## 3. What changed

The schema became data; the scripts became one command.

| Before                                                        | After                                     |
| ------------------------------------------------------------- | ----------------------------------------- |
| 12 `ensure-*.mjs` files, ~2,600 lines                         | `scripts/schema.mjs`, 404 lines (the spec) |
| 11 `npm run <model>:ensure` commands, in a required order      | `npm run db:ensure` — one command, no order |
| `api()` + config + guard copied in 19 files                    | `scripts/lib/appwrite-admin.mjs`, one copy |
| table/column/index loop copied in 8 files                      | `scripts/lib/provision.mjs`, one copy      |
| pagination re-spelled 4 ways, 3 of them wrong (S-3)            | `listAllRows()` — the working spelling, once |
| 2 one-off migrations, both broken (S-3, S-4)                   | 2 working ones: `migrate:org-identity`, `migrate:org-contacts` |
| `harden-profile-permissions.mjs` with no npm script            | `npm run harden:profiles`                 |

Deleted (all still in `git log`): `ensure-audit`, `ensure-business-type`,
`ensure-catalog`, `ensure-indexes`, `ensure-org-columns`, `ensure-orgs`,
`ensure-password-resets`, `ensure-payment-proof`, `ensure-payments`,
`ensure-stats`, `ensure-support`, `ensure-user-profile-org-model`,
`migrate-customer-email`, `migrate-invoice-status`.

Two of those deletions are judgement calls worth stating:

- **`migrate-invoice-status.mjs`** is gone rather than fixed. Its column is in
  `schema.mjs` now, and its `--backfill-sent` flag would be actively harmful
  today: an empty `status` means "Belum dikirim" since the column became
  nullable, so a blind backfill would mark every unsent invoice as sent. The
  script's own header said it must stay opt-in; retiring it is the safer read.
- **`ensure-user-profile-org-model.mjs`** was two things in one file: schema
  (now in `schema.mjs`) and a data backfill (now `migrate-org-contacts.mjs`,
  with the bug fixed and correct pagination).

Fixes landed in the same move: S-2, S-3, S-4 and S-5 are gone by construction —
there is now one implementation of each, and it is the correct one. S-6 is fixed
by declaring `permissions: []` for `catalog` and `stats`, matching the tenancy
pass. S-7/S-8/S-9 are documentation edits in `data-model.md`, `operations.md`,
`AGENTS.md`, `README.md`, `docs/README.md`, `features/email.md`,
`architecture/README.md`, `multi-tenancy.md`, `payments.md`,
`MULTI-ORG-REFACTOR.md`, `BUSINESS_FLOWS.md`, `audit/verification-2026-11.md`
and `.env.example`.

## 4. Deliberately not changed

These are the biggest files in the tree, and splitting them was considered and
rejected for now:

- `functions/api/admin/content.ts` (767), `functions/api/data/[resource].ts`
  (659), `functions/_lib/quota.ts` (485), `functions/api/payments/checkout.ts`
  (428). Each is one coherent unit with a long docstring that explains its
  invariants; mechanical splitting would separate a rule from the comment that
  justifies it, and **nothing here can be run to prove the split is behaviour
  preserving.**
- `src/components/react/admin/admin-content-panel.tsx` (1654),
  `invoice-builder.tsx` (1289), `invoice-table.tsx` (1022),
  `customers-app.tsx` (902). Splitting a hydrated island is a UI change, not a
  file move: it needs a browser to verify, and the bundle budget in
  `architecture/bundle.md` to be re-measured.
- The 19 open items in `CODEBASE_REMEDIATION.md`. Most are not code problems:
  they need a WAF/KV decision (RATE-001, RATE-004), a revocation SLO
  (CACHE-001), or a product answer (SEC-011, DB-005). Guessing at those would
  add work, not remove it.

The criteria for splitting any of them later, written down so it is a decision
and not a mood: **do it when a change you need to make would otherwise have to
be made twice, or when a rule's test would otherwise have to be duplicated** —
not when a file merely looks long.

## 5. How to verify this pass

Nothing below ran on the authoring machine.

1. `node --check scripts/*.mjs scripts/lib/*.mjs` — every file parses.
2. `npm run db:ensure` (dry-run, needs `APPWRITE_API_KEY` in `.env`). Expected:
   every table prints `✓ tabel … sudah ada`, and every column and index prints
   `✓ … sudah ada`. **Anything printing `+ buat` is real drift on the live
   project** — that is the point of the dry run. Pay attention to
   `+ set permissions` lines: those mean the live table differs from the tenancy
   design, and the apply run would change who can write it.
3. `npm run db:ensure -- --list` — the inventory, including which tables are
   `create: false` (Console-owned).
4. `npm run lint` and `npm run typecheck` — the new files are covered by the same
   rules as the rest of the tree (`scripts/` was never excluded).
5. `npm run check` — format, lint, tests, typecheck, as before.
6. The two backfills, when you next need them: run them **without** `--yes`
   first and read the `+` lines; every line names the row and the columns it
   would fill.

If step 2 prints `+ buat` for `password_resets` in production, that table is
missing — the reset flow answers 204 and sends nothing until it exists (this
already happened once; see `features/email.md`).


### First live run — 2026-11-24

`npm run db:ensure` against the production project (dry run, no `--yes`) reported:

- every table, column and index present **except** the seven `payments` columns
  from the settlement work (`planAtCheckout`, `planExpiresAtSnapshot`,
  `activationStatus`, `activationPlan`, `activationExpiresAt`,
  `activationRetryAfter`, `activationError`);
- `documentSecurity` **off** on `organizations`, `memberships`, `payments`,
  `audit_logs`, `support` — S-5, live rather than hypothetical;
- table permissions still `["create(\"users\")"]` on `invoices`, `templates`,
  `customers`, `catalog`, `stats`, which means `ensure-org-columns` never ran
  against this project — S-6 was not theoretical either.

That is the concrete cost behind S-7: the documented order had ten steps and only
part of it had ever been executed, so the schema was complete while two
hardening steps were not.

Verified in production afterwards, password path only: sign in, forgot-password
email delivered, reset link accepted, password changed. That exercises
`password_resets` (table, index, token round trip), the mailer Appwrite Function,
`MAIL_SERVICE_TOKEN` on the Pages project and the Gmail relay, end to end.

**Not verified:** checkout. Until the seven `payments` columns exist, a payment
row cannot carry the frozen baseline that settlement computes from, so CONC-002's
mitigation is inactive in production and the checkout create may be refused
outright. Applying `db:ensure -- --yes` and paying one sandbox order is what
closes it.
