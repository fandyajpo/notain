## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

`npm run build` is `astro build` followed by `node scripts/modulepreload.mjs`, which injects a
`<link rel="modulepreload">` for each page's island dependency graph. Run it through `npm run`
(never `astro build` alone), or the built pages will silently lose those links. `public/_headers`
adds `immutable` caching for `/_astro/*`; do not remove it.

## Deploy

Deploys go through GitHub Actions, not from your machine: push to `main` and `.github/workflows/deploy.yml` runs `npm ci` → `npm run build` → `wrangler pages deploy dist --branch main`. Cloudflare's own auto-build (production _and_ preview) is switched off, so a push triggers nothing on the Cloudflare side — Actions is the only deploy path; running `wrangler pages deploy` by hand still works but silently overrides whatever Actions just shipped. The workflow needs three repository secrets: `CLOUDFLARE_API_TOKEN` (permission `Cloudflare Pages: Edit` plus `Workers R2 Storage: Edit`), `CLOUDFLARE_ACCOUNT_ID`, and `PUBLIC_TURNSTILE_SITE_KEY` (the public Turnstile sitekey, baked into the client build; the build fails without it rather than shipping with the bot gate missing). CI deliberately has no `.env` — the build otherwise falls back to the defaults in `src/appwrite/config.ts`, and the Pages Function reads its `[vars]` and R2 binding from `wrangler.toml`, which is why those values must stay in sync across `.env`, `src/appwrite/config.ts`, and `wrangler.toml`. Logos are stored in the private R2 bucket and served by the `/api/logo` Pages Function.

### Knowing when a build finished

The Cloudflare dashboard always shows "Automatic deployments paused" plus a `github:push` row sitting in `queued`/`idle` on every push — that is the auto-build we switched off, not a failed deploy. The build is done when the Actions run is green (<https://github.com/fandyajpo/notain/actions>, or from a shell without `gh`: `curl -s https://api.github.com/repos/fandyajpo/notain/actions/runs?per_page=1` and read `status` / `conclusion` off the newest workflow run), or when the newest row in Workers & Pages → notain → Deployments says Success. Confirm the bytes that actually shipped by curling production for a fingerprint of that build — the count of `rel="modulepreload"` links on `/`, or `cache-control: public, max-age=31536000, immutable` on any `/_astro/*` chunk.

### Local Pages Functions (the `/api/*` routes)

`astro dev` serves only the static site — the Pages Functions under `functions/` never run there, so anything touching `/api/*` cannot be exercised locally against that server. Use `npm run dev:pages` instead: it runs the full `npm run build` and then `wrangler pages dev dist`, which serves the built site _and_ compiles `functions/` the same way Cloudflare does, with `[vars]` and the `LOGOS` R2 binding from `wrangler.toml` (local R2 state lives in `.wrangler/`).

Secrets are not in `wrangler.toml` (it is committed): put them in `.dev.vars` at the repo root — gitignored — which wrangler loads automatically. The minimum for the admin routes is `APPWRITE_API_KEY` (the API key the Functions use server-side; without it `requireAdmin` answers 500). `TURNSTILE_SECRET_KEY` and the `DOKU_*` credentials are only needed when exercising the contact form or the payment Functions. Smoke-test a route with e.g. `curl -s localhost:8788/api/admin/content` — a JSON error, not an HTML 404, means the Function compiled and answered.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
