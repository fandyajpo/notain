# Admin

The operator console for people who run Notain: user management, editing a
user's content, the support queue, and the audit log. Admin status is a
membership in the Appwrite team `admins`; it is not a flag in the app.

Routes: `/admin/users`, `/admin/content`, `/admin/support`, `/admin/audit`.
`/admin` redirects to `/admin/users` (`astro.config.mjs`, static redirect).
Components: `src/components/react/admin/*`. Hooks:
`src/lib/query/hooks/use-admin.ts`.

## Who is an admin

Membership of the Appwrite team `admins`, checked by the server on every admin
request (`requireAdmin`, `functions/_lib/admin.ts`). The check is cached 60
seconds per isolate, and denials are cached too. A removed admin therefore loses
access within about a minute, on each isolate at its own refresh.

The browser learns its own status from `GET /api/me/admin` (see
`api-reference.md`), which answers `{ isAdmin }` for any signed-in caller so the
sidebar can decide whether to show the Admin group.

## Client gate and server wall

The client checks membership before it renders any admin page, and sends a
non-admin to `/dashboard` with `window.location.replace`. That check is a UX
convenience. Every admin endpoint repeats the server-side check, and the data
boundary is there.

A signed-in non-admin who calls an admin endpoint receives `403 forbidden`, not
`unauthenticated`, so the client's session-expiry handler does not sign them
out. The distinction is deliberate and recorded as a fix in `security.md`.

## Navigation

`AdminNavGroup` (`src/components/react/auth/admin-nav-link.tsx`) renders the
"Admin" group in the sidebar only for admins. It contains four links, defined in
`src/lib/nav.ts`:

- Pengguna (`/admin/users`)
- Konten pengguna (`/admin/content`)
- Bantuan (`/admin/support`)
- Log aktivitas (`/admin/audit`)

Each page is its own island mounted from `src/components/react/admin/admin-app.tsx`.
They share one shell: `AuthGate`, then `AdminGate`, then a page header.

## Users — `/admin/users`

`admin-users-panel.tsx`, backed by `GET|PATCH /api/admin/users` and
`GET|PATCH /api/admin/users/<id>`.

- List: one page of accounts (default 25, maximum 50), each joined with its
  primary organization. Shows the login email, creation date, the account's
  status, the organization name and business type, the contact fields, and the
  plan with its expiry.
- Edit: updates the account's display name and the organization's business
  name, contacts and plan. The plan is written to the organization row. The
  profile half is rolled back if the organization write fails, because the API
  has no transaction.
- Plan: admins can set `free`, `pro` or `business` with an optional expiry. This
  path bypasses DOKU entirely, and it is the only manual route to a plan other
  than settlement.
- Suspend and unsuspend: flips the Appwrite account status. A suspended user
  is refused on their next request and shown the suspended screen. An admin
  cannot suspend themselves.
- Drill-down (`admin-drilldown-modal.tsx`): read-only overview of one user, with
  paged slices of their invoices, customers and templates.

Caveat: the overview counts use `ownerId`. For an organization with several
members, the counts describe the primary member's own creations, not the
organization's totals. Recorded in `audit/verification-2026-11.md`.

## Content — `/admin/content`

`admin-content-panel.tsx` (about 1650 lines) edits one user's templates and
invoices, backed by `GET|POST /api/admin/content`.

- Choose a user, then a resource (`templates` or `invoices`). The list is a lean
  projection; a row's full content is fetched only when its edit dialog opens.
- Create, edit and delete go through the same Zod schemas the user's own forms
  use. Invoice status changes follow the same forward-only transition rules.
- Each row is re-read and must belong to the selected user before any write.
- An invoice create asks for the next free invoice number for that user.
- Conflict detection uses a content fingerprint for invoices and a timestamp for
  templates. A stale edit returns a conflict rather than overwriting.
- Every mutation writes an audit row.

Admins can therefore change a customer's invoice. That is the privileged part of
this console, and it is audited, but it is not read-only. Use it for support,
not for routine work.

## Support — `/admin/support`

`admin-support-panel.tsx`, backed by `GET /api/admin/support` and
`PATCH /api/admin/support/<id>`.

- Newest first, with cursor paging.
- Each message shows the sender, subject, body, source (`landing` or `contact`),
  and whether it is solved and by whom.
- Mark solved stamps `solvedAt` and `solvedBy` with the admin's email. Reopen
  clears both. Both actions are audited.

The messages come from the public contact form. Nothing sends a reply from this
screen; the admin answers by email outside the app, which is the same channel
the form tells people to expect.

## Audit log — `/admin/audit`

`admin-audit-panel.tsx`, backed by `GET /api/admin/audit`. Read-only, newest
first, with cursor paging. Each row has the actor id and email, the action, the
target type and id, the detail, and the timestamp.

Rows are written by `writeAudit()` from the server, never from the browser.
Writes never fail the business action that triggered them: an audit failure is
logged and reported as `false`. An action can therefore complete without its
audit row, and the log does not prove every change. `security.md` lists this as
a limit.

Actions currently written are enumerated in `data-model.md`.

## Quota snapshot

`GET /api/admin/quota` returns this isolate's counters, breaker states, cache
sizes and the effective quota policy, with the published provider limits. It is
per isolate and labelled as such. It is an API endpoint; this document does not
claim a screen renders it.

## What admins cannot do

- Create or delete Appwrite accounts. The console suspends and unsuspends only.
- Read another user's login password. Appwrite does not expose it.
- Manage API keys. `/api-keys` is a placeholder for everyone.
- Bypass the organization membership rules for tenant data outside `/api/admin/*`.
  Admin status exempts the plan gates and the invoice quota, not the tenancy
  gates.

## Files

- Server: `functions/api/admin/{users,users/[id],content,support,support/[id],audit,quota}.ts`,
  `functions/api/me/admin.ts`, `functions/_lib/admin.ts`.
- Client: `src/components/react/admin/{admin-app,admin-users-panel,admin-content-panel,admin-support-panel,admin-audit-panel,admin-drilldown-modal}.tsx`,
  `src/components/react/auth/admin-nav-link.tsx`,
  `src/lib/query/hooks/use-admin.ts`, `src/lib/nav.ts`.
- Pages: `src/pages/admin/{users,content,support,audit}.astro`.
- Tests: `tests/admin-users.test.ts`, `tests/admin-content.test.ts`,
  `tests/admin-support.test.ts`, `tests/audit.test.ts`, `tests/me-admin.test.ts`.
