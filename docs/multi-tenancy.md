# Multi-tenancy — organizations as the data boundary

Every tenant-scoped row in this app belongs to an **organization**, never
directly to a user. A user may belong to many orgs (invite-joined or owned),
switches between them in the UI, and must have at least one: the onboarding
gate (`OrgGate`) creates the first one automatically after sign-up.

## 1. Data model

| Table                                           | Keyed by            | Contents                                                                                          |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `organizations`                                 | `$id` = `org_…`     | `name` (the business name), `ownerId`, **`businessType`**, **`plan` + `planExpiresAt`** (billing) |
| `memberships`                                   | random `$id`        | `orgId`, `userId`, `role` (`owner` \| `member`), `status`, `inviteEmail`, `createdAt`             |
| `profiles`                                      | `$id` = **`orgId`** | The PERSON's profile: `name`, `phone`, `address`, `email`, `logoFileId` (no business identity)    |
| `invoices`, `customers`, `catalog`, `templates` | `orgId` column      | All rows carry `orgId` + keep `ownerId` as creator provenance                                     |
| `stats`                                         | `$id` = **`orgId`** | One dashboard-counter row per organization                                                        |

The business identity is split on purpose: the ORGANIZATION owns its **name** and
**business type** (the workspace's trade), while the `profiles` row is the
person's contact card. Invoices join the two at render time
(`toBusinessIssuer`), so renaming the org or changing its type never touches a
profile row and the two can never drift.

Migrations: [`scripts/ensure-orgs.mjs`](../scripts/ensure-orgs.mjs) creates the
tables and permissions; [`scripts/ensure-org-columns.mjs`](../scripts/ensure-org-columns.mjs)
adds the `orgId` columns and indexes on existing tables. Run both with
`npm run orgs:ensure` / `npm run org-columns:ensure` (see `package.json`).

## 2. Server gates (`functions/_lib/orgs.ts`)

Every org-scoped Function resolves the caller the same way:

1. `requireOrg(request, env, orgIdHint)` — verifies the JWT → session
   (`GET /account`), then reads the membership row for
   **(session.userId, orgIdHint, status=active)**. No row → **404** (a forged
   or stale hint cannot distinguish "not yours" from "doesn't exist").
2. `requireOrgOwner(...)` — same wall plus `role === 'owner'`; used by
   destructive operations (org delete, member removal by policy).
3. `primaryOrgId` / `primaryOrgIds` (`functions/_lib/admin.ts`) — the only
   place that resolves by `userId`: the account's **newest active membership**,
   used exclusively by admin endpoints that address users by their Appwrite
   account id. Newest join wins, matching the order `GET /api/orgs` returns.

The `orgId` a client sends is **always a hint, never authority** — membership
is re-verified server-side on every request.

## 3. API surface

| Endpoint                                | Gate              | Notes                                                              |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| `GET/POST /api/orgs`                    | session           | List orgs + pending invites; create (creator becomes `owner`)      |
| `PATCH/DELETE /api/orgs/[id]`           | `requireOrgOwner` | Rename + set business type; delete **cascades** rows + memberships |
| `GET/POST /api/orgs/[id]/members`       | `requireOrg`      | Members + pending invitations; invite by email                     |
| `DELETE /api/orgs/[id]/members/[id]`    | owner / self      | Owner removes a member; anyone may leave                           |
| `POST /api/orgs/accept`                 | session           | Sweep-accept invites addressed to the signed-in email              |
| `GET/POST/PATCH/DELETE /api/data/[res]` | `requireOrg`      | The tenant-scoped CRUD every list/detail/mutation goes through     |
| `GET/PATCH /api/profile`                | `requireOrg`      | The org's business profile (`profiles/<orgId>`)                    |
| `GET/POST /api/quota/invoices`          | `requireOrg`      | Free tier's **10-invoices-per-month counted per organization**     |
| `GET/PATCH /api/admin/users`, `…/[id]`  | `requireAdmin`    | Resolve primary org first; plan written to `organizations/<org>`   |

Admin content (`/api/admin/content`) still targets rows by `userId` as
creator provenance and re-checks ownership per row.

## 4. Client flow

- **Active org** — [`src/app/active-org.ts`](../src/app/active-org.ts): a
  module store (repositories resolve it at call time), persisted per browser
  under `notain.activeOrgId` and validated server-side on first use.
- **`OrgGate`** (`src/components/react/auth/org-gate.tsx`) wraps every
  authenticated page: fetches the org list, sweep-accepts pending invites
  once per mount, **creates the first org automatically** when the list is
  empty (sign-up path), and falls back to the list when the active org 404s.
- **Switching orgs** — `queryClient.resetQueries` (not `clear()`) resets every
  per-org query through the live observers, so the new org repaints under its
  own loading state instead of the previous org's rows. The session query
  (`staleTime: Infinity`) survives the switch.
- **Switch transition** — the dropdown flags the switch in
  [`src/app/org-switch.ts`](../src/app/org-switch.ts) (module store, same
  pattern as `active-org`); `OrgGate` renders a blocking full-screen overlay
  and clears it only once the target org is validated and the shared client
  has no fetch in flight (450 ms minimum display, 8 s hard cap). If the org
  list errors mid-switch the previous org is restored and an error toast
  explains the rollback.
- **One shared `QueryClient`** — every island (shell *and* pages) reads the
  module-level client from [`src/lib/query/shell-client.ts`](../src/lib/query/shell-client.ts).
  ClientRouter soft navigation remounts page islands, so a per-mount client
  would refetch org/session/profile on every menu click and split
  `invalidateQueries` away from the sidebar dropdown (a rename would never
  reach it); one cache makes navigation cheap and invalidation global.
- Repositories pass `orgId` from the store; query keys stay resource-based
  because the reset-on-switch is what scopes the cache.

## 5. Lifecycle rules

- **Register/login** → `OrgGate` ensures at least one org exists; creating
  one makes the creator `owner`.
- **Owner deletes an org** → every row, membership, and profile keyed by that
  org is removed; other members simply lose it from their list (their other
  orgs are untouched).
- **Member leaves / removed** → only that membership row is deleted; org data
  is untouched.
- **Billing** is per-org: `organizations.plan` + `planExpiresAt` are written
  by checkout/payment settle, the admin panel, and nothing client-side.

## 6. Tests

- `tests/org-endpoints.test.ts` — CRUD, invites, cascade delete, gate rejections.
- `tests/data-endpoint.test.ts` — tenant-scoped CRUD: membership re-check,
  foreign-org 404s, bulk-delete caps.
- `tests/admin-users.test.ts` — primary-org join, plan/profile PATCH targets,
  no-org 404.
- `tests/profile-function.test.ts`, `tests/invoice-quota-endpoint.test.ts` —
  org gates on profile and free-tier quota.

## 7. Honest limits

- The org gate is an **application-level boundary**: it is re-checked on every
  request, but Appwrite row permissions are a separate layer — API-key writes
  deliberately bypass them, which is why the gate lives server-side in the
  Function, not in the client.
- `primaryOrgId`'s "newest membership wins" is a convention, not a schema
  constraint: an account with memberships created in the same millisecond
  resolves to whichever the query returns first.
- Deleting an org is irreversible by design (cascade); there is no undo and
  no soft-delete.
