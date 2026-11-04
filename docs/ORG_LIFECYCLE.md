# Organization lifecycle and no-organization state

## Behavior

- Authentication is account-scoped. `AuthGate` confirms a session, then does not require a profile-completion form or organization.
- Organization-scoped pages pass through `OrgGate`. Loading and error remain distinct; an empty organization list renders the shared no-organization state and an optional create modal. The modal collects only the organization name.
- `/settings` remains available without a workspace. `/settings/organization` falls back to the personal-profile surface and does not expose organization controls when the list is empty.
- `/admin/*` bypasses organization gating. Each admin page keeps its existing `AdminGate` and server-side authorization checks.
- Creation still uses `POST /api/orgs`, which writes the organization and owner membership. Existing multi-organization limits and memberships remain unchanged.
- Deletion removes memberships (including pending invitations) first, then organization-owned records, the legacy `profiles/<orgId>` row and its logo, and finally the organization row. It does not delete `profiles/<userId>` or the Appwrite account. The UI requires an exact organization-name confirmation and explains the consequences.
- After deletion, the active selection is cleared, organization-owned query caches are reset, and the org list is refetched. The session and shared personal-profile cache are preserved.

## Data model and migration

No schema migration is required. The current model already stores account identity separately at `profiles/<userId>` and organization data under organization IDs. TablesDB does not declare relational foreign keys for these rows; ownership and cascades are enforced by the API. The legacy organization profile row is still cleaned up during deletion when present.

## Deletion guarantees and limitation

The cascade is deliberately budgeted across requests to remain below Cloudflare Pages Function subrequest limits. Memberships are deleted first to immediately revoke access. Each invocation verifies that all dependent rows and the legacy organization profile are gone before deleting the root organization; failed reads/deletes return an error rather than reporting success. Repeating the request resumes an interrupted cascade. Personal account/profile records are not in the cascade.

This is not a database transaction. The existing server wrapper addresses Appwrite's `/databases/{databaseId}/collections/{collectionId}/documents` API, while Appwrite's transaction support is exposed through the TablesDB rows/transactions API; the current document calls cannot be staged with a `transactionId`. Switching this lifecycle (and its data access layer) to that API would be a broader storage migration, not a safe localized change. Cloudflare's subrequest limits also require the cascade to resume across requests. A failure can leave a partially deleted organization, but the owner can retry and the API continues safely. No destructive production operation was run.

## Verification scenarios

| Scenario | Implementation / verification |
| --- | --- |
| New account can finish sign-up without an organization or personal-name prompt | AuthGate no longer mounts onboarding; OrgGate displays the optional empty state. Static inspection; runtime test not run here. |
| No-org user can visit dashboard and organization-dependent menu pages | Shared OrgGate empty state blocks tenant data from mounting and offers the create modal. Static inspection; runtime test not run here. |
| Settings remains available for personal profile | AuthGate opts settings into no-org rendering; identity endpoint is session-scoped. Static inspection; runtime test not run here. |
| Create organization in modal | Name-only validated form calls existing create mutation and closes on success; mutation sets active org and refreshes org list. Static inspection; runtime test not run here. |
| Access features after creation | Owner membership is created by existing endpoint; shared cache/selection switch activates it. Static inspection; runtime test not run here. |
| Owner deletes organization; active and pending members are removed | Existing cascade starts with all membership rows; test fixture now includes a pending invitation. Test authored, not executed here. |
| Organization-owned data is deleted | Existing cascade covers invoices, customers, catalog, templates, stats, payments, audit logs, legacy org profile, logo and organization. Existing cascade test asserts key rows; not executed here. |
| Owner and former members retain accounts and personal profiles | Cascade only removes `profiles/<orgId>`; a regression assertion verifies `profiles/<ownerId>` remains. Test authored, not executed here. |
| Former members return to no-organization state | Their memberships are removed; subsequent org list is empty and OrgGate displays the shared state. Static inspection; runtime test not run here. |
| Deletion never forces personal onboarding again | Personal onboarding gate/component removed; no profile-completion redirect remains. Static inspection; runtime test not run here. |
| Admin access remains independent | `/admin/*` bypasses OrgGate and retains AdminGate plus API checks. Static inspection; runtime test not run here. |

Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run format` locally or in CI to execute the verification suite. No production deletion was run.
