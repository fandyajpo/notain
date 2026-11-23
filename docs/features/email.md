# Email

Notain sends three emails, and every one of them leaves the process through the
same place: a small Node service in `mailer/` that owns the SMTP relay and uses
[`@sendust/ts`](https://www.npmjs.com/package/@sendust/ts).

1. **Welcome** — sent right after an account is created.
2. **Password reset** — the link that lets a locked-out user back in.
3. **Nota** — a saved invoice mailed to the customer, with the numbers and the
   capability link.

Nothing else in the product sends mail. Organization invitations are still
disabled (`POST /api/orgs/<id>/members` answers 503), billing does not email
receipts, and nothing mails a payment reminder.

## Why there is a separate process

`@sendust/ts` is a *native* library: a Rust SMTP engine behind a Node-API
binding, published as prebuilt binaries per platform. Cloudflare Workers — where
every `/api/*` route in this app runs — cannot load a native addon at all. There
is no flag, plan or polyfill that changes that.

So the architecture has one seam:

```text
browser → Pages Function (gate, validate, address)
        → HTTPS POST {MAIL_SERVICE_URL}/send   [Bearer MAIL_SERVICE_TOKEN]
        → mailer/ (Node 22) → @sendust/ts → SMTP relay → inbox
```

The Functions never hold SMTP credentials, and the mailer never sees an Appwrite
session. Each side knows only what it needs: the Function knows *who* may send
*what*, the mailer knows *how* to deliver it.

`mailer/README.md` covers running and deploying it (Docker, or an Appwrite
Function). If `MAIL_SERVICE_URL`/`MAIL_SERVICE_TOKEN` are unset the mail
endpoints answer 503 and every other feature is unaffected — email is additive,
never a dependency of saving an invoice or signing in.

## The contract

`functions/_lib/mail.ts` defines one union and one function:

| Type             | Fields                                                                                       | Rendered by                     |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| `welcome`        | `to`, `name`, `loginUrl`                                                                     | `welcomeMessage()`              |
| `password-reset` | `to`, `name`, `resetUrl`, `expiresMinutes`                                                   | `passwordResetMessage()`        |
| `invoice`        | `to`, `customerName`, `invoiceNumber`, `businessName`, `total`, `date`, `dueDate?`, `note?`, `invoiceUrl`, `senderName` | `invoiceMessage()` |

Templates live in `mailer/src/messages.mjs` and are pure functions of that
payload: no clock, no configuration read, no I/O. `mailer/src/render.mjs` renders
one layout twice — HTML and plain text — and escapes every interpolated value,
because a customer name is user input arriving in someone else's mailbox.

`sendMail()` returns `'sent' | 'skipped' | 'failed'` and **never throws**:

- `skipped` — no mailer configured. The two endpoints a person explicitly asks
  for mail from surface that as 503; the welcome message stays silent.
- `failed` — non-2xx, timeout (10 s, `fetchUpstream`), or unreachable.
- No retry here. The mailer already applies `@sendust/ts`'s bounded retry policy
  for transient SMTP failures; retrying from the Function would resend on the
  next hop instead of the next user action, which is worse than a visible error.

`accepted` — what the relay answers — means the relay took responsibility for
the message. It never means a mailbox received it, and no UI in this app claims
otherwise.

## Endpoints

All four live under `functions/api/mail/`. Request/response detail is in
`api-reference.md`; what follows is the rules that matter.

### `POST /api/mail/welcome`

- Gate: **session**. The address comes from the verified session, never the
  body, so this cannot be aimed at a third party.
- Limit: `mail-welcome`, 3/hour per user.
- Called once by the register form after a session exists, fire-and-forget: a
  mail failure must never look like a failed sign-up.
- 202 on success, 503 when the mailer is unset or refused.

### `POST /api/mail/password-reset` — step 1

- Gate: **none**, deliberately. A locked-out user has no session; that is the
  whole point.
- Limit: `password-reset` 5/hour per IP (a real 429) **and**
  `password-reset-address` 3/hour per hashed address (silent).
- Looks the account up with the API key (`GET /users?queries[0]=equal("email"…)`),
  mints a 256-bit token, stores only its SHA-256 in `password_resets`, mails
  `${origin}/reset-password?token=…`.
- **Answers 204 for every outcome** — unknown address, over-limit address,
  provider failure, mailer failure. Only the inbox can prove an address is
  registered; that is what keeps this endpoint from being an account-existence
  oracle. The per-address fence is silent for the same reason: a 429 that only
  real accounts could earn would leak exactly the fact being protected.
- One row per account, keyed `pwreset_<16 hex of sha256(userId)>`: a second
  request invalidates the first link instead of accumulating dead ones.
- `expiresAt` is 30 minutes (`RESET_TOKEN_TTL_MINUTES`), quoted in the email.
- The origin comes from the request (`Origin` header, else the URL), because the
  same build serves `notain.pages.dev`, preview hosts and `localhost:4321`; it
  must be https outside loopback.

### `POST /api/mail/password-reset/confirm` — step 2

- Gate: **none**; the token is the credential.
- Limit: `password-reset` 5/hour per IP.
- Validates the password with `passwordSchema` — the same Zod rule the form uses
  (`src/core/auth/schema.ts`), so a reset cannot store something sign-up would
  have rejected.
- Finds the row by token hash, rejects a missing or expired one with one shared
  message, then writes the new password with the API key
  (`PATCH /users/<id>/password`).
- The token row is **deleted** the moment the password is written: single use,
  and a browser back-button resubmission cannot replay it.
- Ends every session of that account afterwards (best effort): a reset exists to
  evict whoever else had the account.
- 400 for a bad or expired token, 400 with the rule's own copy for a weak
  password, 503 when Appwrite refuses the write (an outage must not burn the
  token).

### `POST /api/mail/nota`

- Gate: session **plus an active membership row** in the organization that owns
  the invoice. Unknown invoice id and foreign invoice id both answer 404, in that
  order, so ids cannot be probed.
- Plan gate: the same one as the public invoice link (active paid plan, or the
  owning organization's owner is an admin). A Free org gets **402** with upgrade
  copy, because the link the email carries would itself answer 402.
- Limit: `mail-nota`, 30/hour per organization.
- Recipient: the body's `to`, else `customerEmail` on the invoice; 400 when
  neither is a valid address.
- The email carries number, dates, total and
  `${origin}/invoice/print/<id>`; the optional note rides above the link.
- No attachment. PDFs here are the browser's print dialog (ADR 0007), so there
  is no server-side file to attach — the message says the numbers instead.
- **A successful send flips an unset invoice to `sent`** (`''`/absent → `sent`),
  which is the only forward transition `core/invoice/status.ts` allows from
  unset. `paid` and `void` are never touched; a second send changes nothing.
- The client invalidates the invoice detail, every invoice list and all dashboard
  finance periods, because the status may have changed.

## Password reset vs Appwrite's own recovery

`account.createRecovery()` still exists in `src/infra/appwrite-auth-repository.ts`
and `/reset-password` still accepts Appwrite's `?userId=…&secret=…` link. That is
deliberate: messages sent before the mailer existed are sitting in inboxes, and
breaking them would lock people out.

What changed is which path a new request takes. Appwrite never reveals the
recovery secret it emails, and `account.updateRecovery` needs exactly that, so
owning the email meant owning the token: `password_resets` plus
`users.updatePassword` under the API key. The account-enumeration behaviour is
unchanged (the same confirmation screen either way), and the request endpoint
still needs no session.

The reset page decides by query string: `token` means the new flow, `userId` +
`secret` means the Appwrite one. Both need only the new password.

## Gmail / Google Workspace

The mailer's configuration is Google-shaped by default, because that is the
relay most small businesses already have:

```text
SMTP_USER=you@gmail.com
SMTP_PASS=<16-character App Password>
```

- `SMTP_HOST` defaults to `smtp.gmail.com` when `SMTP_USER` is an `@gmail.com`
  or `@googlemail.com` address, `SMTP_PORT` to `465` (implicit TLS, 587 flips to
  STARTTLS automatically), and `MAIL_FROM` to `SMTP_USER`. `MAIL_FROM` therefore
  never has to be set for the common case.
- Google rejects a normal account password from an app. An App Password is
  required (needs 2-Step Verification): `myaccount.google.com/apppasswords`.
  The four groups of spaces Google displays are stripped by the mailer, so the
  value can be pasted exactly as shown.
- The mailer refuses to boot on a Google relay without a password, and warns
  (without refusing) when the password is not 16 characters — the shape of an
  App Password — or when `MAIL_FROM` is on another domain, because Google only
  accepts the authenticated address or a verified "Send mail as" alias. Those
  warnings are the difference between a five-minute setup and a 535 at 2 a.m.
- A Workspace address on a custom domain still uses `smtp.gmail.com`; the
  address no longer implies the host, so `SMTP_HOST` must be set there.
- Google caps sending per account per day (roughly 500 recipients for free
  Gmail, 2 000 for Workspace). That is a relay refusal, surfaced as the 503 the
  endpoint already returns — never a silent drop, and never retried into a
  larger bill.

`mailer/test/config.test.mjs` pins all of the above, including the defaults, the
space stripping and the warnings.

## Limits and what they do not promise

- Every limit is **per isolate** (`functions/_lib/quota.ts`): it resets when
  Cloudflare recycles the isolate and is not fleet-wide. It is a cost fence and a
  speed bump, not a security boundary. The token itself is the boundary.
- The account lookup (`GET /users`) and the row write both spend Appwrite quota;
  the per-IP fence is what keeps a flood from turning into provider reads.
- A mailer outage is visible and local: the two explicit flows answer 503, the
  welcome message is skipped, and nothing else changes.

## Files

- `mailer/` — the service (`src/server.mjs`, `src/service.mjs`,
  `src/messages.mjs`, `src/render.mjs`, `src/transport.mjs`, `Dockerfile`).
- `functions/_lib/mail.ts` — the contract and the one outbound call.
- `functions/_lib/reset-token.ts` — token minting, hashing, row id, TTL.
- `functions/api/mail/{welcome,nota,password-reset}.ts` and
  `functions/api/mail/password-reset/confirm.ts`.
- `src/app/mail.ts` — client calls; `src/lib/query/hooks/use-mail.ts` — mutations.
- `src/components/react/auth/auth-form.tsx` — the three auth screens.
- `src/components/react/invoice/email-nota-dialog.tsx` — "Email" in the builder.
- `scripts/ensure-password-resets.mjs` — the table, columns and index.

## Operational checklist

1. `npm run password-resets:ensure -- --yes` (once).
2. Run `mailer/`: `npm install && npm start`, with `SMTP_*`, `MAIL_FROM`,
   `MAIL_SERVICE_TOKEN` set (see `mailer/.env.example`).
3. Set the Pages side: `MAIL_SERVICE_URL` (plain variable) and
   `MAIL_SERVICE_TOKEN` (encrypted:
   `wrangler pages secret put MAIL_SERVICE_TOKEN`).
4. Send one welcome mail from a throwaway account, and one reset from
   `/forgot-password`, before trusting either.
