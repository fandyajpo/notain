# Authentication and tenancy

How a person becomes a signed-in account, how that account proves itself to
the Functions, and how an organization membership decides what the account can
touch. Read `architecture/system.md` first for the request paths; this document
covers the identity and authority rules in depth.

## Two separate questions

Notain answers two questions with two different mechanisms:

1. **Who is calling?** Answered by Appwrite. The browser holds an Appwrite
   session cookie (set through a same-origin proxy) and mints a short-lived JWT
   from it. The Functions verify that JWT by calling Appwrite's `GET /account`.
   No Notain server holds a user credential.
2. **What may they touch?** Answered by Notain's own `memberships` table, read
   on every tenant request. Appwrite row permissions play no part, because they
   cannot express "members of organization X".

Consequence: the Appwrite API key lives only in Functions and scripts, and every
tenant table is written and read through the API key behind a membership check.

## Sign-in methods

- **Email and password** — `signIn` and `signUp` in `src/app/auth.ts` call the
  auth repository, then `rememberSession()`. Registration validates the form
  with `src/core/auth/schema.ts`; Turnstile is enforced when a sitekey is
  configured (`src/lib/turnstile.ts`).
- **Google and Discord OAuth** — `signInWithGoogle` and `signInWithDiscord`
  write two short-lived same-site cookies (`oauth_state`, `oauth_next`, ten
  minutes), then send the browser to Appwrite's OAuth start URL. The start URL
  deliberately bypasses the proxy: Appwrite's own state cookie has to live on
  Appwrite's domain for its callback to read it.
- **The OAuth callback** — Appwrite returns `userId` and `secret` to
  `/auth/callback`, not a session. `completeOAuth` compares the returned `state`
  with the cookie this tab wrote; a mismatch or a missing cookie throws
  `unauthenticated` before any exchange. Both cookies are cleared either way, so
  a round trip is single use. On success it calls `completeGoogleOAuth` (the
  provider-agnostic exchange) and returns the stored `next` path after the
  same-origin check.
- **Password recovery** — `/forgot-password` asks
  `POST /api/mail/password-reset` for a link; `/reset-password` redeems it with
  `POST /api/mail/password-reset/confirm`. The link is
  `<origin>/reset-password?token=…` — a 256-bit single-use token, stored only as
  a SHA-256 in `password_resets`, valid 30 minutes, deleted as the new password
  is written. The origin comes from the request, not from configuration, so the
  same build works on `notain.pages.dev`, a preview host and `localhost:4321`;
  https is required outside loopback. Appwrite's own `?userId=…&secret=…` link
  still works (the page accepts both), because messages sent before the mailer
  existed are still in inboxes. `architecture/README.md` records that
  `localhost:4321` is registered as a Web platform; the production host must be
  added separately for the legacy path. Full design: `features/email.md`.
- **Sign-out** — `signOut()` tolerates `unauthenticated` and `suspended` from
  the server (a blocked account cannot end its own session) and then calls
  `forgetSession()`. Any other failure is re-thrown, so the user is not silently
  logged out over a network blip.

## The session cookie and the proxy

`functions/api/appwrite/[[path]].ts` relays every Appwrite call the SDK makes,
so the session cookie is set by our own origin. Appwrite normally scopes that
cookie to its own domain. From our origin it is third-party, and browsers that
block third-party cookies would drop it, leaving sign-in looking successful and
the next request anonymous. The relay removes the `Domain` attribute from each
`Set-Cookie` and keeps `HttpOnly`, `Secure`, `SameSite`, path and expiry as
Appwrite sent them.

The relay adds no API key and makes no authorization decision. It strips
`origin` and `referer` so Appwrite treats the call the way it treats server
clients. The consequence, recorded in `security.md`, is that the proxy has no
CSRF defence of its own: the cookie's `SameSite` attribute is the only one.

## Minting and caching the JWT

`src/appwrite/client.ts` owns `mintJwt()`:

- one token serves every call until it is within 30 seconds of expiry, read
  from the token's own `exp` claim (fallback 14 minutes);
- concurrent callers share one `createJWT()` request;
- the token lives only in module memory — never in cookies or storage;
- `clearMintedJwt()` runs on every sign-in and sign-out, and an epoch counter
  stops a mint started for the previous account from being cached.

On the server, `verifySession()` (`functions/_lib/appwrite.ts`) validates the
bearer with `GET /account` and caches the verified identity for 60 seconds per
isolate, keyed by the SHA-256 of the token. Failures are never cached, and an
unreachable Appwrite fails closed.

The 60-second cache means a suspended or logged-out account can keep acting for
up to a minute on an isolate that has already seen its token. `security.md`
records this as an accepted trade-off with a configuration lever
(`QUOTA_SESSION_CACHE_TTL_MS`).

## Session state in the browser

- `src/app/session.ts` memoizes the current account. `rememberSession()` bumps an
  epoch so an in-flight lookup for the previous account cannot overwrite the
  new one. `forgetSession()` does the same on sign-out.
- The session query has `staleTime: Infinity` (`src/lib/query/policies.ts`).
  Only an explicit sign-in or sign-out, or the expiry handler, changes it.
- **Expiry** — `createSessionExpiryHandler` (`src/lib/query/session-expiry.ts`)
  handles a 401 from any query or mutation. It does not sign out immediately: it
  asks Appwrite whether the session is really gone. A 401 for a missing table or
  another account-level refusal leaves the session alone. A genuine expiry
  clears the cached session, shows a toast, and redirects to
  `/login?next=<current path>` after 1.2 seconds. Auth pages are excluded to
  stop a redirect loop.
- **Suspension** — Appwrite refuses requests from a blocked account with
  `user_blocked`, which the repository maps to `ERROR_CODES.SUSPENDED`. The
  suspended screen replaces the app; signing out remains possible.

## Organization membership

The `memberships` row is the authority. Columns and indexes are in
`data-model.md`. The rules, as implemented in `functions/_lib/orgs.ts`:

- `requireOrg(request, env, orgIdHint)` validates the hint's shape (400),
  verifies the session (401), requires server configuration (503), then reads
  the membership with `orgId = hint`, `userId = session.userId`,
  `status = 'active'`. No row answers 404. A foreign organization and a missing
  one give the same response, so ids cannot be probed.
- `requireOrgOwner` adds `role === 'owner'` and answers 403 `forbidden` to a
  member, who has legitimately seen the organization.
- **Membership is never cached.** A removed member loses access on their next
  request. This is the one place Notain chooses freshness over cost.
- A pending invitation never satisfies `requireOrg`, because the lookup requires
  `status = 'active'`.

The `orgId` a client sends is a hint. Every tenant read and write re-resolves it.
Rows written through `/api/data/*` are stamped with the resolved `orgId` and the
session's `userId` (as `ownerId`, which records creator provenance only).

## Roles

Owner — everything a member can do, plus organization identity and contacts,
the plan, member removal, and deletion. An owner cannot be removed from the
organization by anyone, including themselves; the owner leaves by deleting it.

Member — read and write the organization's invoices, customers, catalog and
templates; read the member list; leave the organization. A member cannot
change organization identity, buy a plan, remove others, or delete it.

Admin — member of the Appwrite team `admins`, checked by `requireAdmin` or
`isAdminUser` (cached 60 seconds per user, denials included). Admins bypass
the organization-creation limit and the free invoice quota, and an organization
whose owner is an admin serves public invoice links without a paid plan.
Admins act on another user's data only through `/api/admin/*`, which writes an
audit row for each mutation.

## Choosing the active organization

`src/app/active-org.ts` holds the selected organization id in a module store,
persisted in `localStorage` under `notain.activeOrgId`, validated against the
organization id pattern on read. Repositories read it when a call is made and
throw a domain error if none is selected.

`OrgGate` (`src/components/react/auth/org-gate.tsx`) keeps the selection honest
on every change of the organization list:

- it accepts pending invitations once per mount;
- a selection missing from the server's list falls back to the first
  organization, or to the previous one during a failed switch;
- an empty list shows the shared `NoOrganizationState`, and the selection is
  cleared only when the list is not still refetching;
- every per-organization query is reset (`resetQueries`, leaving the session
  alone) when the selection really changes;
- the switch overlay stays up until the target is validated and no fetch is in
  flight, with a 450 ms minimum and an 8 s cap.

## Mutations and organization switches

`src/lib/query/org-mutation.ts` records the organization id and a generation
number when a mutation starts. It refuses to send, or to resume after an await,
if either has changed. A slow save started in one organization therefore cannot
land in another after a switch.

## Organization lifecycle

- **Create** — `POST /api/orgs` writes the organization and the owner membership.
  The first owned organization is always allowed. A second requires a paid plan
  on an organization the caller owns; admins skip the check. A failed membership
  write removes the new organization, and a failed removal is audited as
  `org.create.compensation-failed`.
- **Rename and business type** — `PATCH /api/orgs/<id>`, owner only.
- **Members** — removal and leaving are `DELETE /api/orgs/<id>/members/<id>`.
  Invitation creation is disabled (503). Acceptance by email still works for
  invitations that already exist.
- **Delete** — `DELETE /api/orgs/<id>` is a budgeted cascade the client repeats
  until it reports `done`. It refuses while a payment is pending and unexpired,
  or paid with activation pending. Memberships go first, so access is revoked
  before anything else. The organization row goes last, because the
  continuation path authorizes against it. The personal profile and the
  Appwrite account are never deleted. The operation is not a database
  transaction; an interrupted delete is resumed by repeating it.

## Personal identity versus organization identity

`profiles/<userId>` holds the person's name and phone and is reachable without
any organization. `organizations/<orgId>` holds the business name, the
contacts, the logo, the business type and the plan. Invoices and the public
site read the business identity from the organization row and fall back to the
legacy `profiles/<orgId>` row only for organizations created before the split.

## Account deletion and personal data

No endpoint deletes an Appwrite account. Organization deletion removes
organization data and the memberships that point at it. Personal profile rows
remain after the organization is gone. This is recorded as a limit in
`security.md`.

## Known edges

- `primaryOrgId` (the admin's view of "which organization is this user's") takes
  the newest active membership. Two memberships created in the same millisecond
  resolve to whichever Appwrite returns first.
- The 60-second caches for session and admin status are per isolate, so a
  revocation takes effect on each isolate at its own next refresh.
- A user who is a member of several organizations has no default organization
  on the server; the browser's stored selection, or the first entry in the list,
  decides.
