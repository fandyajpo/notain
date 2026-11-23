# Notain mailer

The one process in this repository that sends email. It is a small Node 22
service whose only job is to turn a validated JSON payload into one SMTP
message through [`@sendust/ts`](https://www.npmjs.com/package/@sendust/ts).

## Why a separate process

`@sendust/ts` is a native Node-API addon (Rust core, Node-API binding). Every
`/api/*` route in this app runs on Cloudflare Workers, and a Worker cannot load
a native addon at all — not on the free plan, not on a paid one. So the relay
call has to happen on a real Node runtime, and Cloudflare Functions reach it
over HTTPS with a shared token.

The notain side of the contract is `functions/_lib/mail.ts`; the four endpoints
that call it are documented in [`docs/features/email.md`](../docs/features/email.md).

## Endpoints

`POST /send` — bearer `MAIL_SERVICE_TOKEN`, JSON body:

```json
{
  "type": "welcome",
  "to": "kamu@email.com",
  "name": "Budi",
  "loginUrl": "https://notain.pages.dev/login"
}
```

```json
{
  "type": "password-reset",
  "to": "kamu@email.com",
  "name": "Budi",
  "resetUrl": "https://notain.pages.dev/reset-password?token=…",
  "expiresMinutes": 30
}
```

```json
{
  "type": "invoice",
  "to": "pelanggan@email.com",
  "customerName": "Sari",
  "invoiceNumber": "INV-2026-014",
  "businessName": "Warung Sari",
  "total": 250000,
  "date": "2026-11-08",
  "dueDate": "2026-11-22",
  "note": "Terima kasih sudah memesan.",
  "invoiceUrl": "https://notain.pages.dev/invoice/print/inv_…",
  "senderName": "Budi"
}
```

Answers: `200 { ok: true, status: "accepted" }`, `400` for a payload that fails
validation, `401` for a wrong token, `502` when the relay refused the message.
`GET /healthz` needs no token and opens no SMTP session.

`accepted` means the relay took responsibility for the message. It does not
mean a mailbox received it — no SMTP client can promise that.

## Running it

```bash
cd mailer
cp .env.example .env      # fill in the relay, sender and token
npm install               # pulls the matching native addon
npm start                 # http://0.0.0.0:8080, loads .env if it exists
```

`npm start` runs `node --env-file-if-exists=.env src/server.mjs`, so the file is
optional and a real environment variable always wins over it — that is how
Docker and the Appwrite Function pass the same names without a file.

Node 22.23.5 or newer is required by the package itself. The addon ships
prebuilt for macOS (x64/arm64), Windows x64 and Linux (x64/arm64, gnu and musl);
anything else has no binary and the package refuses to load, so there is no
silent fallback to something slower.

`npm test` runs the configuration, message-rendering and request-validation
tests with Node's own runner. They import nothing native, so they pass before
`npm install` too — which is why the root project can run them with
`npm run test:mailer`, no `mailer/` install required.

## Gmail / Google Workspace

An `@gmail.com` or `@googlemail.com` account needs **two values only**:

```text
SMTP_USER=you@gmail.com
SMTP_PASS=<16-character App Password>
```

`SMTP_HOST` defaults to `smtp.gmail.com`, `SMTP_PORT` to `465` (implicit TLS),
and `MAIL_FROM` to `SMTP_USER`. Google will not accept your normal account
password from an app, so create an App Password first (it requires 2-Step
Verification): <https://myaccount.google.com/apppasswords>. Paste it with or
without the spaces — they are stripped.

Two constraints come from Google, not from this service:

- **From must be the account.** Google accepts the authenticated address or an
  alias you added under "Send mail as" and verified. Anything else is rewritten
  or refused; the service logs a warning at boot when `MAIL_FROM` disagrees.
- **There is a daily sending cap.** Around 500 recipients a day for a free Gmail
  account, around 2 000 for Workspace (Google's numbers, not ours). Hitting it
  is a relay refusal, not a Notain error — the endpoint answers 503 and the
  message is not retried.

A Workspace address on a custom domain (`halo@mycompany.com`) still uses
`smtp.gmail.com`, so set `SMTP_HOST=smtp.gmail.com` explicitly: the address
alone no longer implies it.

## Deploying it

**Docker** (`Dockerfile` in this folder): a two-stage-free, single-stage
`node:22-bookworm-slim` image that installs production dependencies, copies
`src/`, runs as `node`, and listens on `0.0.0.0:$PORT` (default 8080). Debian
rather than Alpine because the published Linux binary is the glibc target.

The first `npm install` also writes `mailer/package-lock.json` — commit it and
switch the Dockerfile to `npm ci` if you want reproducible installs.

**As an Appwrite Function** (`src/appwrite.mjs`): runtime `node-22`, build
command `npm install && node src/appwrite.mjs`, SMTP credentials as function
variables. No shared token is needed in that mode — Appwrite decides who may
execute the function. Point `MAIL_SERVICE_URL` at the function's execution URL.

**Never** put `SMTP_PASS` or `MAIL_SERVICE_TOKEN` in `wrangler.toml`, `.env`
(for Vite) or any committed file. The token pairs with the encrypted Pages
variable of the same name.
