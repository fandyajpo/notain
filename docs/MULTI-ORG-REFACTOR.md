# Multi-Organization Refactor — Architecture & Audit Report

Covers the refactor to the two-entity model requested after the codebase audit: **User**, **Organization**, and **OrganizationMembership** — with the Letterhead entity that was briefly introduced (and removed in the same series) fully retired.

## 1. Target architecture (as implemented)

| Entity                     | Storage                                                                 | Fields                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**                   | Appwrite account (`$id`, `email`, `name`) + `userProfiles/<userId>` row | id, email (account, read-only in UI), username, phone. `created_at`/`updated_at` ride on the account and the document's `$createdAt`/`$updatedAt`.                                                                                 |
| **Organization**           | `organizations/<orgId>` row                                             | id, name, slug (unique, server-generated), contact block (email, phone, website, address, taxId, logoFileId), `businessType`, `plan`/`planExpiresAt` (billing), `ownerId` (see §2), createdAt. `$updatedAt` is a system attribute. |
| **OrganizationMembership** | `memberships/<random>` row                                              | id, userId, orgId, role (`owner`/`member`), status (`active`/`pending`), inviteEmail, invitedBy, createdAt. Uniqueness on `(orgId, inviteEmail)`; role lives on the membership row, never on a profile.                            |

Relationship rules honored: many-to-many via `memberships`; one shared profile per account; ownership = membership role (+ `organizations.ownerId` as the anonymous-gate/deletion-continuation anchor — see §5); org data always `orgId`-scoped.

**Deliberate extra columns** (allowed by "only add fields when required by existing, demonstrable functionality"): billing columns are written by checkout/payment-settle/admin only; `businessType` drives template grouping and the public page; `ownerId` backs the anonymous public-invoice admin exemption and the cascade-delete continuation path; the contact block backs invoices and the public page directly.

## 2. Dependency map (what consumed the old per-org profile)

| Consumer                               | Before                                                | After                                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding (first login)               | wrote `profiles/<orgId>` + account placeholder name   | unchanged + now also writes the shared `userProfiles` username                                                                                                   |
| Settings → Kelola Profil               | per-org profile form                                  | **shared identity editor** (`/api/profile/user`), login email read-only from session                                                                             |
| Settings → Kelola Organisasi           | per-org profile form ("letterhead")                   | **org contact editor** (`PATCH /api/orgs/<id>`, owner-only) writing the org contact block                                                                        |
| Public invoice `GET /api/invoice/<id>` | profile row + org name                                | **org row directly** (name, email, phone, address, logo), legacy profile row only as backfill fallback; payload shape unchanged so the print client is untouched |
| Public site `GET /api/site/<id>`       | profile row contact fields                            | **org row contact columns** (profile fills gaps for un-backfilled orgs); `ownerName` now reads the owner's `userProfiles` username (profile-name fallback)       |
| Admin panel                            | profiles/<primaryOrg> join + PATCH writes profile row | **still on the legacy table** — the legacy row stays populated (nothing else writes it) so admin data does not go stale; migration listed as outstanding (§7)    |
| Invoice builder issuer defaults        | `getProfile()` (`/api/profile`)                       | **still on the legacy endpoint** — works as-is; switch to org contact + user identity is outstanding (§7)                                                        |
| Logo storage                           | R2 object ids referenced by the profile row           | org contact editor reuses the same `/api/logo` Function; `logoFileId` now lives on the organization row                                                          |

## 3. What was added / removed

**Added:** `userProfiles` table; `organizations` contact columns (slug unique, email, phone, website, address, taxId, logoFileId); `GET/PUT /api/profile/user`; contact fields on `PATCH /api/orgs/<id>` (owner-only) + `GET` identity read (owner-only); `GET /api/orgs/<id>` identity read; `Settings → Kelola Profil` shared identity editor; `Settings → Kelola Organisasi` org contact editor; onboarding writes the shared identity; slug generation on create; migration script `scripts/ensure-user-profile-org-model.mjs` (`npm run profile-org-model:ensure`).

**Removed:** the Letterhead entity introduced mid-stream (`letterheads` table usage, `GET/PUT /api/orgs/<id>/letterhead`, letterhead rows on create, letterhead reads in the public invoice endpoint) — deleted per the revised spec; no renamed equivalent exists. The legacy per-org `profiles` table is no longer edited by any UI; it remains as a read-fallback/backfill source and its rows are preserved (no destructive ops).

## 4. Migration runbook

1. `npm run profile-org-model:ensure` — dry-run preview.
2. `npm run profile-org-model:ensure --yes` — creates `userProfiles`, adds the organizations contact columns + unique `bySlug` index, and backfills (only-empty-wins, from every `profiles/<orgId>` row): org slug/email/phone/address/logoFileId, and `userProfiles/<ownerId>` username/phone. If the earlier letterhead variant was already run, re-running is safe: the letterheads table may exist in Appwrite as an orphan (never dropped — non-destructive §10) and can be removed in the Console after verification.
3. Rollback/recovery: no columns are dropped and no rows deleted; the legacy `profiles` rows remain the data of record until §7 completes. Reverting the code restores the previous behavior with no data loss.

## 5. Query scoping & authorization audit

Every tenant read/write goes through Pages Functions (API-key backed, empty row permissions):

- `requireOrg` verifies session JWT + an **active** membership row per request and 404s unknown/foreign orgs identically (no probing); `requireOrgOwner` adds `role === 'owner'` for rename/contact/deletion.
- `GET/POST/PATCH/DELETE /api/data/<resource>` is the only tenant CRUD path: orgId stamped server-side from the gate, whitelisted filters, row-in-tenant re-reads on GET/PATCH/DELETE (a foreign row id 404s), bulk delete ≤20 with ownership re-checks.
- Membership revocation takes effect on the next request (membership lookups deliberately never cached); suspended/blocked accounts fail closed.
- Public endpoints are capability-URL based (invoice, site) with plan gates; the public invoice plan gate keys off the org's owner for the admin exemption.
- Deletion cascade is budgeted and owner-driven; memberships die first (access cut immediately), org root last; the owner can never be removed via the members endpoint, so no ownerless orgs arise through normal flows; org-create compensation failures are audited (`org.create.compensation-failed`).

## 6. Behavior without an organization

`OrgGate` wraps every authenticated page: no active org ⇒ pages never mount (no misleading empty tables), the invite sweep runs, and the onboarding/create-organization flow renders. The shared profile is reachable because its endpoint is session-gated. Deleting the last org drops the user straight back into the create flow.

## 7. Outstanding items (documented, not hidden)

1. **Admin panel** still joins the legacy `profiles/<primaryOrg>` for contact fields (and writes them on admin PATCH). It remains _correct_ (that table is now write-frozen by the UI) but should switch to `organizations` contact columns + `userProfiles` for the owner identity.
2. **Signed-in invoice builder issuer defaults** still read `getProfile()` (`/api/profile`). The public invoice path is org-first; the builder should follow (org contact + user identity) so brand-new orgs get pre-filled issuer defaults.
3. ~~**`/api/site/<id>` ownerName** still uses the profile row's name~~ — **done**: reads the owner's `userProfiles` username with a profile-name fallback.
4. **Legacy `profiles` table retirement**: after items 1–2, stop reading it everywhere, keep the rows (data preservation), and optionally add a tombstone migration.
5. **Formatter run**: `npm run format` before merging if CI flags new files.

## 8. Test scenarios (§13) — mapped

| #     | Scenario                                  | Coverage                                                                                                                   |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1     | New user creates first org                | `tests/org-endpoints.test.ts` (create → owner membership + profile row); manual: onboarding modal e2e                      |
| 2     | Existing user, no duplicates              | onboarding guard tests + org-create single-org rule (403 test in org-endpoints)                                            |
| 3     | Second organization                       | org-endpoints "allows a second organization once a paid plan is active"                                                    |
| 4     | User owns multiple orgs                   | `GET /api/orgs` list test + switcher e2e                                                                                   |
| 5     | Joins as member                           | invite accept flow (`orgs/accept` tests in org-endpoints)                                                                  |
| 6     | Switching orgs                            | `org-gate.test.tsx`, `org-switch.test.ts`, resetQueries cache isolation                                                    |
| 7–9   | Cross-org invoice/customer/catalog access | `tests/data-endpoint.test.ts` foreign-org 404s per resource + row-in-tenant re-checks                                      |
| 10    | Member ≠ owner ops                        | `requireOrgOwner` 403 tests (rename/delete/invite) in org-endpoints + contact PATCH owner-only                             |
| 11–12 | Owner deletes org; other orgs unaffected  | cascade tests in org-endpoints (two-org seeding, "leaves org B untouched")                                                 |
| 13    | No-org empty states                       | OrgGate onboarding render tests (`org-gate.test.tsx`)                                                                      |
| 14    | Profile without org                       | new: `GET/PUT /api/profile/user` is session-gated — scenario documented, endpoint test recommended                         |
| 15    | Invoices/PDFs after Letterhead removal    | public invoice payload shape unchanged (`invoice-link-gate.test.ts` still passes); fallback path covers un-backfilled orgs |
| 16    | Historical data association               | migration backfill is only-empty-wins and never re-keys rows; scenario = post-migration spot check in Appwrite console     |

## 9. Acceptance status

Two-entity architecture ✅ · one shared profile ✅ · Letterhead entity/UI/queries removed ✅ · org-scoped data + server authz ✅ (pre-existing, audited) · switching + no-org states ✅ · data preservation + additive migrations ✅. Outstanding: §7 items 1–3 (admin join, builder defaults, ownerName refinement), formatter run, endpoint tests for `user-profile`/`org-contact`.
