# Settings and profile

The account and organization settings surfaces: the personal profile, the
business ("usaha") settings, the logo, and the public-page link. Two routes,
two identities, one shell.

Routes and components: `/settings` → `ProfileSettingsApp` and
`/settings/organization` → `OrgSettingsApp`, both in
`src/components/react/settings/settings-app.tsx`. Billing is a separate route,
`/billing` (`src/components/react/billing/billing-app.tsx`).

## Two identities

**Pengaturan (`/settings`)** edits the shared account identity:

- `username` (≤128) and `phone` (Indonesian mobile pattern, ≤32), through
  `UserProfileEditor`, which calls `GET|PUT /api/profile/user`.
- The login email, shown read-only from the session. No endpoint can change it.
- The "Putar ulang tur" control, which restarts the welcome tour.

This page works with zero organizations. Its endpoint is gated by the session
alone, which is why it stays reachable from the no-organization state.

**Pengaturan usaha (`/settings/organization`)** edits the active organization:

- `OrgSection`: the organization name, business type, the member list, and the
  owner-only delete cascade (`org-section.tsx`, 547 lines).
- `OrgContactEditor`: the contact block that prints on invoices and shows on the
  public page — `email`, `phone`, `website`, `address`, `taxId`, and the logo.
- The public-page card: shows `/site/<orgId>` and links to it in a new tab. The
  link is addressed by the organization id; every member sees the same URL.

With no organization selected, the organization page falls back to the profile
view and exposes no organization controls.

## Who may change what

The server decides; the form only reflects it.

- Organization identity and contacts: owner only. `GET` and `PATCH
  /api/orgs/<id>` both use `requireOrgOwner`. A member sees the fields
  disabled, and a forged request still gets 403.
- Business type: owner only, validated against the taxonomy on write.
- Members: any member may read the list. Removal is owner-only, and a member may
  remove only themselves.
- The account identity: each user edits only their own row, by session.

## Validation

Enforced in the Function, mirrored in the form:

- organization name: 1–128 characters;
- contact email: shape-checked, ≤320;
- contact phone: Indonesian mobile pattern, ≤32;
- website ≤320, address ≤512, tax id ≤64;
- business type: a slug the taxonomy still knows, or `null` to clear it.

An empty string clears a nullable contact field; an absent key leaves it alone.

## Logo

The organization logo is uploaded with `POST /api/logo` (session JWT) and the
returned file id is saved on the organization row through `PATCH
/api/orgs/<id>`.

- Accepted types: PNG, JPG, SVG, WEBP, ICO. Maximum 2 MB, checked in the browser
  and again on the server.
- Each upload writes a new object key. The previous logo is removed only after
  the new reference is saved, so a failed save never leaves the organization
  without a logo.
- Logos are served from `/api/logo/<key>` with immutable caching and the sandbox
  CSP (`security.md`).

## Public page

The card shows the public URL and opens `/site/<orgId>`. What that page renders
is described in `features/public-pages.md`. This page only links to it; it does
not publish or unpublish anything, because the current route has no publish
switch.

## Known gaps

- `BUSINESS_FLOWS.md` describes a subscription card on `/settings`. The current
  `settings-app.tsx` renders no billing card; subscription and history live at
  `/billing`. The guide is the one that is out of date. Recorded in
  `audit/verification-2026-11.md`.
- The organization page's contact editor saves through the org endpoint, while
  the profile page saves through `/api/profile/user`. Two saves, two endpoints,
  one visible form each. This is by design, not a bug.
- Deleting the organization from this page runs the budgeted cascade described
  in `auth-and-tenancy.md`. It does not delete the owner's account or the
  owner's personal profile.

## Files

- `src/components/react/settings/{settings-app,org-section,org-contact-editor}.tsx`
- `src/components/react/profile/user-profile-editor.tsx`
- `src/components/react/auth/org-gate.tsx` (wraps the organization page)
- `src/app/user-profile.ts`, `src/app/org-contact.ts`, `src/app/orgs.ts`
- `src/components/react/invoice/logo-uploader.tsx` (logo upload control shared
  with the builder)
- `functions/api/profile/user.ts`, `functions/api/orgs/[id].ts`,
  `functions/api/logo.ts`
