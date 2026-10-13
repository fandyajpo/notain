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

Deploys go through GitHub Actions, not from your machine: push to `main` and `.github/workflows/deploy.yml` runs `npm ci` → `npm run build` → `wrangler pages deploy dist --branch main`. Cloudflare's own auto-build (production _and_ preview) is switched off, so a push triggers nothing on the Cloudflare side — Actions is the only deploy path; running `wrangler pages deploy` by hand still works but silently overrides whatever Actions just shipped. The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (permission `Cloudflare Pages: Edit` plus `Workers R2 Storage: Edit`) and `CLOUDFLARE_ACCOUNT_ID`. CI deliberately has no `.env` — the build falls back to the defaults in `src/appwrite/config.ts`, and the Pages Function reads its `[vars]` and R2 binding from `wrangler.toml`, which is why those values must stay in sync across `.env`, `src/appwrite/config.ts`, and `wrangler.toml`. Logos are stored in the private R2 bucket and served by the `/api/logo` Pages Function.

### Knowing when a build finished

The Cloudflare dashboard always shows "Automatic deployments paused" plus a `github:push` row sitting in `queued`/`idle` on every push — that is the auto-build we switched off, not a failed deploy. The build is done when the Actions run is green (<https://github.com/fandyajpo/notain/actions>, or from a shell without `gh`: `curl -s https://api.github.com/repos/fandyajpo/notain/actions/runs/1` and read `status` / `conclusion`), or when the newest row in Workers & Pages → notain → Deployments says Success. Confirm the bytes that actually shipped by curling production for a fingerprint of that build — the count of `rel="modulepreload"` links on `/`, or `cache-control: public, max-age=31536000, immutable` on any `/_astro/*` chunk.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
