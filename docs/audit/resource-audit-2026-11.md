# Resource audit — November 2026

A pass over what costs time, bundle size and Appwrite quota, with what was
removed and what is deliberately still there. Companion to
[`simplification-2026-11.md`](./simplification-2026-11.md), which covers the
provisioning scripts.

## What this pass changed

**R-1 — the failed-answer parser existed nine times.** `serverMessage` — the
one function that turns `{ error, message }` into the sentence a person reads —
was copied into nine modules in `src/app/`. The copies had already drifted:
five read `body?.message`, four read `body.message`, and `support.ts` had a
different return type. That is the kind of difference nobody notices until a
screen prints "undefined".

It is now `src/app/response.ts` (23 lines), and eight modules import it. The
ninth (`support.ts`) keeps its own: it answers a plain `string`, not
`string | undefined`, so folding it in would change its signature at every call
site. Net: −64 lines, one behaviour.

## Findings, ranked

| # | Finding | Cost | Effort |
| :- | :-- | :-- | :-- |
| R-2 | **`bearerFetch` exists six times** — `orgs.ts`, `data-api.ts`, `payments.ts`, `org-contact.ts`, `user-profile.ts`, and the shared `bearer-fetch.ts`. Each mints a JWT, sets the bearer, maps `UNAUTHENTICATED` and `NETWORK`. Only the shared one learned `keepalive`; the other five never got it, which is why the welcome mail had to be threaded through the shared copy. | ~110 duplicate lines, one fix that does not reach five call sites | Convert the five call sites to `{ method, body }` (each currently passes `content-type` + `JSON.stringify`), then delete the copies. Wants a green suite first. |
| R-3 | **Unfenced reads are the real quota risk.** `docs/CODEBASE_AUDIT.md` RATE-002 (`GET /api/invoice/<id>`, fully anonymous, 3–5 Appwrite reads per hit) and RATE-003 (authenticated list reads cost nothing) are still open. A loop over either burns the Appwrite Free monthly reads faster than any code cleanup saves. | Appwrite Free reads (500k/month) | Out of scope here: it changes behaviour on public endpoints and wants a fence designed, not a rename. |
| R-4 | **`GET /api/orgs` is N+1** (DB-001): one membership read per organization to build the switcher list. | One Appwrite read per org per load | Same shape as R-3: a query or a rows-level join, not a mechanical edit. |
| R-5 | **The Appwrite Function deploys on every push to `main`**, even when nothing under `mailer/` changed. Appwrite's Git integration rebuilds and republishes the container each time. | One container deploy per commit | Configure a build filter in the Appwrite console (paths `mailer/**`), or accept it: the deploy is ~10 s and does not consume Cloudflare quota. |
| R-6 | **`src/components/dashboard/.gitkeep` and `src/components/ui/.gitkeep`** are placeholders for folders that now hold real files. | Nothing at runtime | Delete on the next touch of those folders. |

## What was checked and found clean

- **Every `/api/*` route has a caller.** All 30 route files under `functions/api/`
  are referenced from `src/` — except `/api/csp-report` (called by the browser
  from `public/_headers`), `/api/payments/doku-notify` (called by DOKU) and
  `/api/admin/quota` (an operator endpoint, documented as curl-only in
  `api-reference.md`). None is dead.
- **Every dependency is imported.** `motion` (landing), `driver.js` (tours),
  `heic2any` and `xlsx` / `jspdf` (lazy, on the click that needs them),
  `@tanstack/*` (form, query, table, pacer, hotkeys, store, markdown),
  `@lucide/astro` and `@lucide/svelte` (header and items grid). Nothing to drop
  — and dropping one would need `npm install` to refresh the lock, which is not
  something a phone can do.
- **The sampled `src/` modules are all reachable**: `active-org`, `draft-storage`,
  `builder-tabs`, `calc-inspector`, `sample`, `seed`, `shell-client`,
  `builder-ui`, `shortcuts`, `use-dashboard-finance`, `use-profile`.
- **`useUserIdentity` is a read**, not a write: `queryPolicy('profile')` and
  `GET /api/profile/user`, so a page visit costs one Appwrite read per session,
  not one per mount.

## How to check this

- `npm run test` — the eight touched modules are exercised by `src/app/*.test.ts`
  and by the endpoint suites in `tests/`.
- `npm run typecheck` — `noUnusedLocals` is on, so an import left behind by a
  deletion fails here rather than in review.
- `npm run db:ensure` — the schema half of the same question (see
  `simplification-2026-11.md`).

Nothing in this pass was measured on a device: the line counts are from the
files, and the quota figures are the published Free-plan limits, not observed
usage.
