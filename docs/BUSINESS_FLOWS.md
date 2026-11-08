# Current business flows

This guide describes the business behavior implemented in the current source tree. It is a static source review, not a claim that the flows were run against a live deployment. If an older document or source comment conflicts with executable behavior, follow the endpoint and current tests.

**Test-scene status:** The good and bad scenes below are candidates for a later test plan. They have not been executed. Use isolated test accounts, organizations, and synthetic records in a preview/staging environment. Use DOKU sandbox only. Do not send real payments or webhooks to production, delete production organizations, or run the production-oriented `scripts/ensure-payments.mjs` as a test.

## Actors and tenancy model

- **Visitor/customer:** not signed in; can use public invoice/site capability URLs and submit the public contact form.
- **Signed-in user:** account holder. An account can exist without an organization; account identity settings remain available in that state.
- **Organization owner:** can change organization identity/contact, purchase Pro for that organization, remove members, and delete the organization.
- **Organization member:** can use the organization's features and read the member list, but cannot change owner-only settings, purchase a plan, or remove other members.
- **Admin:** a user in the Appwrite `admins` team. Admin authorization is checked by server endpoints; it is not inferred from a client flag.

Tenant data is gated by the caller's session and an active membership in the selected organization. The client-supplied `orgId` is only a hint; the server rechecks membership. Rows written through the tenant data API are stamped server-side with the verified `orgId` and caller `ownerId`.

## 1. Account access and recovery

**Actor:** visitor or account holder.  
**Routes:** `/register`, `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`.

**Implemented flow**

1. Register or sign in with email/password, or start Google/Discord OAuth. Registration validates the form; Turnstile is enforced when configured and is otherwise absent.
2. A successful sign-in stores the app session. OAuth uses a short-lived, single-use state value and returns through `/auth/callback` before navigating to a validated same-origin `next` path.
3. The first authenticated app visit creates/initializes the shared account identity row when needed. It does **not** automatically create an organization or require a personal-name onboarding screen.
4. A protected page that requires an organization shows the no-organization state when none exists; `/settings` and `/admin/*` are intentionally not blocked by the organization gate. Suspended accounts see the suspended state.
5. Password recovery sends a reset link and shows the same confirmation regardless of whether the email belongs to an account. The reset link supplies `userId` and `secret`; the user chooses and confirms a new password.

**Failure and boundaries**

- Invalid form values, wrong credentials, rejected/missing configured Turnstile, expired/invalid recovery link, or invalid OAuth state must not create an authenticated session.
- Recovery confirmation must not reveal whether an email is registered.
- Unsafe or self-redirect `next` values fall back to the app's safe default; OAuth state is single-use.
- Signing out locally remains possible when the server session is already gone or the account is suspended. Other unexpected sign-out failures are surfaced rather than silently discarding the local session.

**Good-path scene:** create an account, land on a protected page without being forced to create a workspace, visit `/settings`, create an organization later, and return to the originally requested safe route after a sign-in detour.  
**Bad-path scenes:** malformed credentials; unknown-email recovery; invalid/expired OAuth callback state; off-origin `next`; configured Turnstile rejection; suspended account on its next authenticated request.

**Source:** `src/app/auth.ts`, `src/components/react/auth/auth-form.tsx`, `src/components/react/auth/auth-gate.tsx`, `functions/api/profile/user.ts`.

## 2. Organization lifecycle, switching, and members

**Actor:** signed-in user, owner, or member.  
**Routes:** organization switcher; `/settings/organization`; `/api/orgs`, `/api/orgs/[id]`, `/api/orgs/[id]/members`, `/api/orgs/accept`.

**Implemented flow**

- Creating an organization is optional. The first owned organization is allowed on Free. A Free account can own one organization; creating another requires an active paid plan on an organization the user owns. Admins bypass that creation limit. Each new organization starts on Free and has its own invoice, customer, catalog, template, and billing scope.
- The creator becomes the active owner. Switching organization validates the target and resets tenant data queries before showing the new workspace; a failed switch restores the previous selection rather than exposing stale rows as the target workspace.
- Owners can rename the organization and set/clear its business-type taxonomy value. Members see the organization name but cannot edit owner-only fields.
- Members can read the active and pending membership list. An owner can remove a member or withdraw a legacy pending invitation; a non-owner can leave their own membership. The owner cannot leave/remove themself; deleting the organization is the owner exit path.
- **New member invitations are disabled.** `POST /api/orgs/[id]/members` returns HTTP 503 with `Fitur undangan anggota belum tersedia. Kamu belum bisa mengirim undangan otomatis.` Do not test a successful new invitation. Existing legacy pending invitations can still be listed and accepted by email on an authenticated load via `/api/orgs/accept`.
- Organization deletion is permanent and owner-only. The UI requires the exact organization name. The server blocks deletion while a payment is pending/unexpired or a paid payment still has activation pending. Otherwise it deletes memberships first, then tenant rows, legacy organization profile/logo, organization logo and root row through repeatable budgeted requests. It does not delete the Appwrite account or the shared personal profile. Interrupted deletion can be retried; this is not a database transaction.

**Good-path scenes:** create the first Free workspace; add a second workspace only after an active paid entitlement; switch between two workspaces and verify data isolation; remove a member and confirm access fails on their next request; delete a test organization with no live payments and verify the account remains usable.

**Bad-path scenes:** Free owner creates a second workspace (403); member attempts owner-only rename/contact/delete or removal of someone else (403/404); caller supplies a foreign org ID (no data access); member attempts to remove owner (409); owner attempts deletion with an active payment (409); delete cascade is interrupted and safely resumed. Confirm invite creation remains disabled (503), while no legacy invite is not an error.

**Source:** `functions/api/orgs.ts`, `functions/api/orgs/[id].ts`, `functions/api/orgs/[id]/members.ts`, `functions/api/orgs/[id]/members/[membershipId].ts`, `src/app/orgs.ts`, `src/components/react/settings/org-section.tsx`, `src/components/react/auth/org-gate.tsx`, `docs/ORG_LIFECYCLE.md`.

## 3. Account profile and organization settings

**Actor:** signed-in user; organization owner for organization fields.  
**Routes:** `/settings`, `/settings/organization`; `/api/profile/user`, `/api/orgs/[id]`, `/api/profile`, `/api/logo`.

**Implemented flow**

- `/settings` edits the shared account username and phone. The login email comes from the Appwrite session and is read-only. Saving the username also mirrors it to the Appwrite account on a best-effort basis; the profile row is the source of truth.
- `/settings/organization` edits the active workspace name, business type, business email/phone/website/address/tax ID, and logo. Organization contact fields are what invoices and the public business page use. Owner-only server checks remain authoritative even when the UI disables fields for members.
- Logo upload writes a new object and updates the organization's logo reference. The UI documents a 2 MB limit and accepts PNG/JPG/SVG/WEBP/ICO. Failed upload/save must surface an error; the previous logo reference should not be treated as replaced until the new value saves.
- With no organization, organization settings fall back to the personal-profile surface and do not expose organization controls.

**Good-path scenes:** edit account name/phone while organizationless; edit organization contacts as owner and see them on a rendered invoice/site; clear optional organization fields; upload a valid logo.  
**Bad-path scenes:** invalid phone/email, overlong values, member attempts to submit owner-only changes, malformed/oversized logo, server outage during save. Verify login email and plan fields cannot be changed through account/org profile payloads.

**Source:** `src/components/react/settings/settings-app.tsx`, `src/components/react/settings/org-contact-editor.tsx`, `functions/api/profile/user.ts`, `functions/api/orgs/[id].ts`, `functions/api/profile.ts`, `functions/api/logo.ts`.

## 4. Invoice authoring, editing, status, and print/share

**Actor:** signed-in organization member.  
**Routes:** invoice picker/builder (including `/invoice/new`); `/dashboard`; `/invoice/print/<invoiceId>`; WhatsApp handoff.

**Implemented flow**

1. The user chooses a built-in or saved template, enters customer details and line items, optionally fills business-specific fields, discount/tax, sections and notes. Totals are calculated in the client. A new draft is autosaved locally per account; local-storage failure is non-fatal. Editing an existing invoice is guarded against accidental navigation with unsaved changes.
2. The builder validates the full draft and, for a new invoice, checks the organization's invoice quota immediately before creating. Save is protected from rapid duplicate submissions in the UI. A successful save clears the local draft and best-effort remembers the customer and checked catalog items; failure of those secondary writes does not roll back the invoice.
3. An existing invoice can be edited without changing its status. Status is a separate write and only moves forward: `null → sent → paid | void`; `paid` and `void` are terminal. Re-selecting the current status is an idempotent no-op. Status cannot be cleared or moved backward.
4. A saved invoice can be opened in print/PDF view, shared as a public invoice link, or used to prefill a WhatsApp message when the customer phone exists. WhatsApp handoff does not send the message or attach a PDF on the user's behalf.
5. Invoice rows retain the issued customer name/phone/email snapshot. Renaming or deleting a directory customer does not rewrite old invoices.

**Important limits and failure behavior**

- Invoice numbers must be unique within the relevant owner/workspace; a duplicate is rejected. Required fields and line item/adjustment values are validated by the shared invoice schema on the client and at the API boundary.
- A fresh invoice starts with no status. The save endpoint does not permit creating a new row already marked `sent`, `paid`, or `void`.
- Quota errors block create from the normal builder path; the direct tenant create API does not independently recount monthly quota (see §5).
- A saved invoice can render as a local/owner print view independently of the public plan gate. The public capability URL is separately gated by active paid entitlement (see §10–11).
- Payment-proof upload is not payment processing and does not advance status. The owner must verify payment outside Notain and set `paid` manually.

**Good-path scenes:** create and save a valid invoice; reload an unsaved new invoice and confirm its local draft restores only for the same account; save with customer/catalog remembering enabled; edit content without touching status; advance `null → sent → paid`; print/download and open WhatsApp when a phone is present.

**Bad-path scenes:** missing customer/name or invalid item/adjustment; duplicate invoice number; attempted create already marked paid; attempt to reverse/clear a terminal status; two-tab content edit; missing WhatsApp phone; localStorage write blocked; customer/catalog secondary write fails while invoice save succeeds; attempt public invoice link on Free/expired plan.

**Source:** `src/components/react/invoice/invoice-builder.tsx`, `src/app/invoices.ts`, `src/core/invoice/status.ts`, `src/core/invoice/schema.ts`, `functions/api/data/[resource].ts`, `src/app/active-org.ts`.

## 5. Free invoice quota

**Actor:** signed-in organization member.  
**Routes:** invoice builder; `GET/POST /api/quota/invoices?orgId=…`.

- Free allows 10 invoices per calendar month per organization. The count uses invoice `$createdAt`, not the invoice's user-entered date. The current counter rolls over at the next calendar month.
- Active paid organizations are unlimited and skip the history-count walk. The builder calls a read-only quota claim before a new save; editing an existing invoice does not consume an allowance.
- When used, the normal builder reports the remaining count; an exhausted claim returns HTTP 402. An unreadable count is an outage (503), not a fabricated zero-use answer.
- This is a product-flow guard, not a hard API security boundary: `POST /api/data/invoices` does not recount the month if called directly. Two simultaneous read-only claims can both pass near the limit and allow a small race overrun.

**Good-path scenes:** Free org at 9/10 creates its tenth; next month the count resets; active paid org sees no remaining-count cap and does not scan its invoice history.  
**Bad-path scenes:** eleventh normal builder create receives 402; quota read outage fails closed; non-member cannot read/claim another org's quota; test the documented same-time claim race separately from the normal UI behavior; in an isolated environment only, demonstrate the direct-create limitation and do not treat it as expected enforcement.

**Source:** `functions/api/quota/invoices.ts`, `functions/_lib/invoice-quota.ts`, `src/core/billing/plans.ts`, `src/components/react/invoice/invoice-builder.tsx`.

## 6. Customer directory and spreadsheet import/export

**Actor:** signed-in organization member.  
**Route:** `/customers`; invoice builder customer picker.

- Users can add, edit, delete, search, paginate, export selected/all customers, bulk-delete, and merge selected customers. Merge writes the chosen target values before deleting source records; if source deletion fails, the safer outcome is a remaining duplicate rather than lost data.
- Spreadsheet import recognizes a name header (`Nama`/`name`) and optional email/phone aliases. Blank rows are skipped; row-level validation issues retain spreadsheet row numbers. Import and export use the same customer schema/data columns.
- Saving an invoice tries to remember its customer. That path first matches normalized email **and** normalized phone, then falls back to case-insensitive name; non-empty new contact data can refresh the matched row. Invoice snapshots remain unchanged.
- **Customer import identity is an implementation/comment mismatch worth testing:** `importCustomers` calls `isSameCustomer`, which requires both normalized email and normalized phone to match (at least one field must be present). It does not merge on email OR phone as the nearby function comments claim. Indonesian phone digits normalize `62…` to `0…`; email matching is trimmed and case-insensitive. Same email with a different phone, or same phone with a different email, does not match in import. Name-only records do not match by identity.

**Good-path scenes:** add/edit a valid customer; import a valid sheet and export it back; merge two selected rows while choosing surviving values; invoice save remembers customer and updates last-used recency.  
**Bad-path scenes:** missing name, invalid email/phone, duplicate exact email+phone pair on manual create, import with missing name header, invalid rows alongside valid rows, same-email/different-phone import behavior, no-email/no-phone imports, stale IDs in bulk delete/export, merge fails during source cleanup.

**Source:** `src/components/react/customers/customers-app.tsx`, `src/components/react/customers/customer-import.tsx`, `src/app/customers.ts`, `src/core/customer/model.ts`, `src/core/excel/customers.ts`.

## 7. Product/service catalog

**Actor:** signed-in organization member.  
**Routes:** `/catalog`; invoice builder catalog picker.

- Users can add, edit, search, paginate, export, and delete catalog entries. A manually created duplicate is rejected by normalized name, independent of case/spacing. Catalog entries contain name, kind (`barang`/`jasa`), unit, and unit price.
- The invoice builder can copy a catalog entry into a line item. On invoice save, checked nonblank items are remembered non-fatally. Auto-remember matches by normalized name, refreshes unit and price while preserving stored kind/name, and collapses duplicate names in one save.
- A zero price on the public business page means “Hubungi,” not a literal Rp0 price.

**Good-path scenes:** add an item, use it to prefill an invoice, change values and save to refresh the remembered catalog fields, export and bulk delete selected entries.  
**Bad-path scenes:** blank name, invalid kind/unit/price, duplicate normalized name, nonexistent/foreign row ID, autosave catalog failure must not make invoice save fail.

**Source:** `src/components/react/catalog/catalog-app.tsx`, `src/app/catalog.ts`, `src/core/catalog/model.ts`, `src/components/react/invoice/invoice-builder.tsx`, `functions/api/data/[resource].ts`.

## 8. Invoice templates

**Actor:** signed-in user with an organization; built-ins are available to use.  
**Routes:** `/templates`, `/templates/new`, `/templates/<id>`, invoice builder.

- Three built-in templates are selectable. A user with an organization can create a custom template by copying a built-in, edit its name/layout/theme/default content, and delete it. Built-ins themselves are not user-owned and cannot be deleted.
- The builder applies a selected template's defaults to still-empty sections and allows switching templates without clearing content already typed. A missing/deleted custom template falls back to a built-in presentation; existing invoice content remains.
- Free accounts with an organization can use and customize templates; organizationless accounts are limited to the built-in templates in the UI. Admins may manage user content through the admin workflow.

**Good-path scenes:** select a built-in, duplicate/customize it, use it in a new invoice, switch templates while preserving entered sections, delete a custom template used by an existing invoice and verify fallback.  
**Bad-path scenes:** invalid template shape/name; organizationless user tries a custom-template write; member/foreign-org attempts access; stale concurrent template update should return conflict rather than silently overwrite.

**Source:** `src/components/react/template/templates-app.tsx`, `src/app/templates.ts`, `src/core/template/schema.ts`, `functions/api/data/[resource].ts`, `src/components/react/invoice/invoice-builder.tsx`.

## 9. Dashboard, statistics, and finance

**Actor:** signed-in organization member.  
**Routes:** `/dashboard` and finance/date-range panels.

- Dashboard summary counts invoices by status, customers, and templates. On a visit it recomputes from source rows and best-effort persists the stats row; missing stats storage does not prevent fresh counts from being returned.
- Finance uses a selected date range for revenue/receivables and the same fetched invoice window for the six-month chart, attention items and recent activity. Invoice totals are derived from line items; they are not a stored total field. The bounded cursor walk returns a `truncated` signal if it hits its 20-page cap rather than silently promising a full result.
- This is bookkeeping/analytics, not a payment gateway or bank reconciliation. An invoice marked paid is a user-entered status.

**Good-path scenes:** verify dashboard counts against known test rows; compare finance range totals with hand-calculated invoice fixtures; verify a paid invoice contributes to received revenue and an unpaid overdue invoice appears in attention.  
**Bad-path scenes:** stats storage missing/write fails but live counts remain; date boundaries; malformed/empty optional data; finance fixture exceeds the page cap and reports truncation; a proof upload alone does not count as paid revenue.

**Source:** `src/app/stats.ts`, `src/app/finance.ts`, `src/core/stats/finance.ts`, invoice status sources in §4.

## 10. Plan selection, checkout, and entitlement

**Actor:** organization owner.  
**Routes:** `/pricing`, `/checkout?plan=…`, `/payment/result?invoice=…`, `/settings` subscription card; `/api/payments/checkout`, `/api/payments/status`, `/api/payments/portal`, `/api/payments/doku-notify`.

- Billing and plan entitlements are per organization. Pro is currently listed at Rp 49.000 for 30 days. Prices are resolved server-side; the client sends only the plan and org identifier.
- The owner starts a DOKU **sandbox** checkout. An active paid plan cannot be downgraded through checkout. Existing valid pending checkout may be resumed; duplicate concurrent requests are protected by a deterministic per-org/plan/month payment-row ID plus pending-order handling.
- A signed DOKU notification or authenticated Check Status reconciliation calls the same settlement state machine. A browser redirect/query parameter never activates a plan. A paid row is recorded before organization activation; if activation is temporarily pending, a later notification/status read retries the fixed target rather than charging/extending twice.
- Status page polls while pending. Reconciliation waits at least 60 seconds from order creation, limits DOKU probes, and leaves the local row unchanged on provider failure. Portal is read-only and shows the active organization's plan and recent history, with resume links only for valid pending orders.
- Renewing the same active plan extends from its current expiry; otherwise the paid period starts at the confirmed payment time. An active paid plan with no expiry is treated as lifetime (admin-managed state).
- **Business checkout is disabled.** It is labelled coming soon and `/api/payments/checkout` rejects it before auth/provider work. A Business entitlement can still be set by an authorized admin; this is not customer checkout availability. Free is not purchasable.
- These flows are configured for DOKU sandbox in the current source. Production payment verification is explicitly out of scope here.

**Good-path scenes (sandbox only):** owner starts Pro checkout; duplicate request reuses the one order or receives a controlled conflict; confirm with a valid sandbox notification; return page shows pending then paid/active; portal reports the org plan/history; same-plan renewal extends once.  
**Bad-path scenes:** member attempts checkout (403); wrong-org ID (404); Business/Free plan request rejected with no order; client tampers amount (server still uses catalog); another user polls an order (404); invalid signature or mismatched invoice/amount cannot activate; duplicate notification cannot extend twice; DOKU outage, failed activation, expired order, and missing auth display clear recoverable states. Never send these tests to production or use real payment credentials.

**Source:** `src/core/billing/plans.ts`, `src/app/payments.ts`, `functions/api/payments/checkout.ts`, `functions/api/payments/status.ts`, `functions/api/payments/portal.ts`, `functions/api/payments/doku-notify.ts`, `functions/_lib/payment-settle.ts`, `src/components/react/checkout/checkout-app.tsx`, `src/components/react/checkout/payment-result-app.tsx`.

## 11. Public invoice page and payment proof

**Actor:** customer with a capability URL; invoice owner.  
**Routes:** `/invoice/print/<invoiceId>`, `/api/invoice/<invoiceId>`, `/api/invoice/<invoiceId>/proof`, `/api/proof/<key>`.

- The invoice ID is a capability URL. Anonymous public reads return a deliberately narrow print payload only if the owning organization has an active paid entitlement, except when that organization's owner is an admin. Free/expired organizations receive 402; unknown IDs return 404. Public reads have a per-IP rate fence and `no-store` response.
- Public business identity comes from the organization row. A legacy organization profile can fill missing contact/logo values for old data; internal IDs, plan data and raw object IDs are not exposed in the public payload. If the invoice's custom template is missing, the client falls back to a built-in.
- A customer may upload one payment-proof image while the invoice is not `paid` or `void`. The public upload requires Turnstile when configured, accepts PNG/JPG/WEBP after client-side conversion (including HEIC), and is limited to 5 MB. A lock and row reference prevent a second public upload. Uploading proof does **not** mark the invoice paid.
- The owner may upload/replace a proof with a session, including on a terminal invoice, and may delete it. Deletion clears the invoice pointer before deleting the object. Owners must verify funds outside Notain and then change invoice status separately.

**Good-path scenes:** active-Pro invoice opens publicly; customer uploads valid proof once; owner sees proof, verifies payment independently, marks invoice paid, and can remove proof; owner replacement updates the pointer and removes the old object.  
**Bad-path scenes:** Free/expired org receives 402; non-existent ID 404; unsupported/oversized file refused; Turnstile missing/rejected/outage; second public upload conflicts; public upload on paid/void conflicts; owner session for a different invoice refused; non-owner cannot delete proof; failed pointer-clear keeps the object; upload never changes status.

**Source:** `functions/api/invoice/[id].ts`, `functions/api/invoice/[id]/proof.ts`, `functions/api/proof/[key].ts`, `src/app/public-invoice.ts`, `src/components/react/invoice/invoice-builder.tsx`.

## 12. Public business site

**Actor:** anonymous visitor; organization owner sets the displayed data in settings.  
**Routes:** `/site/<orgId>` and `GET /api/site/<orgId>`.

- The path contains the **organization ID**, not an account/owner ID. The endpoint is public and does not require a paid plan or sign-in. It returns 404 for a missing organization or blank organization name; a provider outage is 503, not “page not found.”
- The page displays organization business name/type, available owner/contact details, logo URL and up to 100 sorted catalog items. A missing catalog is a valid empty page; a zero item price displays “Hubungi.”
- Contact precedence follows the current endpoint: organization phone/address/logo first, with legacy organization profile fallback; the owner name comes from the shared account profile, with legacy profile fallback. The public contact email is the organization's value only, never the owner's login email. Plan/expiry, raw logo IDs and tenant row metadata are omitted. The site is `noindex`.
- There is no separate publish/unpublish control in the current route; a named organization is publicly addressable by its organization-ID URL.

**Good-path scenes:** open `/site/<orgId>` while signed out for both Free and Pro test orgs; verify business details/catalog reflect organization settings; a blank catalog still renders; zero price shows “Hubungi”; check private plan/internal IDs do not appear.  
**Bad-path scenes:** user ID used instead of org ID returns 404 unless it coincidentally names an org; blank org name/missing org returns 404; malformed catalog rows are omitted/degraded; catalog over 100 rows is bounded; rate limit returns controlled response; email fallback never exposes login email.

**Source:** `functions/api/site/[id].ts`, `src/app/public-site.ts`, `src/components/react/settings/settings-app.tsx`, `docs/business-site.md` (historical notice applies).

## 13. Public contact and support handling

**Actor:** anonymous visitor; admin handles the submitted message.  
**Routes:** public landing/contact form (`/contact`); `POST /api/support`; `/admin/support`.

- The form is anonymous and records its source (`landing` or `contact`). The server validates name, email, optional subject and message length, applies a rate fence, verifies Turnstile, and writes a permissionless support row. The UI shows success only after the write succeeds and prevents repeat-submit from the same completed form state.
- Admins can page through messages and mark them solved or reopen them. Each state change stamps/clears solved metadata and writes an audit action.
- The form copy says a reply is expected by email in 1–2 business days, but this flow only stores the message; there is no automated reply/delivery workflow in these endpoints. Do not make a test assert an outbound email.

**Good-path scenes:** valid anonymous submission from each source; admin sees the right source and marks solved/reopens with metadata/audit.  
**Bad-path scenes:** blank/invalid email, too-short/too-long message, Turnstile missing/rejected/outage, rate limit, support table missing/unavailable, unauthenticated/non-admin access, nonexistent message ID.

**Source:** `src/components/react/support/support-form.tsx`, `src/app/support.ts`, `functions/api/support.ts`, `functions/api/admin/support.ts`, `functions/api/admin/support/[id].ts`, `src/components/react/admin/admin-support-panel.tsx`.

## 14. Admin operations

**Actor:** Appwrite `admins` team member.  
**Routes:** `/admin/users`, `/admin/content`, `/admin/support`, `/admin/audit`; `/api/admin/*`.

- All admin API endpoints verify both session and server-side `admins`-team membership. The client page gate is a UX guard, not the security boundary.
- Users: list/search/filter and page users; update account profile plus primary organization's business name/plan; set/revoke paid plan manually; suspend/unsuspend Appwrite accounts. Admin cannot suspend themself. A user with no organization has no organization business/plan row to modify. Plan/expiry data lives on the organization, not the account profile.
- Suspended users are blocked on their next server request and shown the suspended screen. Unsuspending restores account access.
- Read-only drill-down covers overview and paged invoices/customers/templates. Admin content tools can create/edit/delete user invoices/templates, but still validate the normal schemas, recheck row ownership, enforce invoice status transitions and audit mutations. This is a privileged mutation surface, not a read-only feature.
- Support messages can be solved/reopened. Audit log is paginated and read-only from the admin UI. Admin actions are audited where implemented; audit-write failure may be reported separately after a business write has already succeeded.
- Admin membership bypasses organization-create and invoice quota limits; organization ownership gates still apply where an operation specifically requires the organization owner (for example customer checkout).

**Good-path scenes:** non-admin is denied by server despite directly calling API; admin lists/updates a test user and sees organization plan changes; suspend test user then verify blocked access; unsuspend; inspect drill-down; edit test content through schema-valid admin tools; solve support ticket and inspect audit.

**Bad-path scenes:** missing/invalid admin membership; self-suspend; invalid plan/profile; edit/delete another user's row ID; stale content fingerprint or template timestamp returns conflict; invalid invoice transition remains blocked even for admin; audit failure produces warning without unsafe blind retry. Use test identities only.

**Source:** `src/components/react/admin/admin-app.tsx`, `src/components/react/admin/admin-users-panel.tsx`, `functions/api/admin/users.ts`, `functions/api/admin/users/[id].ts`, `functions/api/admin/content.ts`, `functions/api/admin/support.ts`, `functions/api/admin/support/[id].ts`, `functions/api/admin/audit.ts`, `functions/_lib/admin.ts`.

## 15. API keys placeholder

**Actor:** signed-in user.  
**Route:** `/api-keys`.

This route is not an API-key management flow. It renders “Kunci API segera hadir” and links to developer information. There is no current UI/API to create, list, rotate, revoke, or inspect usage of customer API keys.

**Good-path scene:** open `/api-keys` and verify the explicit coming-soon state and developer link.  
**Bad-path scenes:** no create/revoke/usage scenario is applicable; do not treat an empty table as a failed implementation or claim keys are provisioned.

**Source:** `src/components/react/api-keys/api-keys-panel.tsx`.

## Cross-cutting test setup and verification boundaries

- Use two synthetic users and at least two organizations to exercise owner/member roles, active-org switching and cross-tenant attempts. Separate browser profiles are useful for concurrent sessions.
- Keep expected HTTP behavior explicit: validation/client errors differ from provider outages; a 503 is not an empty list/zero quota, and a 404 intentionally hides whether a foreign row exists.
- Use a fresh test dataset or explicitly reversible fixture IDs. Avoid production deletion, real charges, unapproved webhook delivery, or scripts that create/modify provider schema/data.
- Check server-side state as well as UI copy for payment, invoice status, proof pointers, membership removal, plan ownership, and admin changes.
- This guide does not replace [`TEST_SCENARIOS.md`](./TEST_SCENARIOS.md), which focuses on audit/security/infrastructure questions, nor does it assert either suite has been run.
