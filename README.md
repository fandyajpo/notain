# Notain

Generator invoice/nota untuk UMKM Indonesia. Data disimpan di Appwrite Cloud
(auth, TablesDB), logo di Cloudflare R2, template invoice bisa dikustomisasi
lewat UI di `/templates`, dan PDF dihasilkan lewat print-to-PDF browser.

Spesifikasi lengkap: [`NOTAIN_MVP.md`](./NOTAIN_MVP.md).
Arsitektur, keputusan desain (ADR), bundle, dan caching:
[`docs/architecture/`](./docs/architecture/README.md).
Pembayaran langganan (DOKU Checkout sandbox): [`docs/payments.md`](./docs/payments.md).

## Stack

- Astro (static site) + TypeScript strict
- Empat framework dalam satu halaman via custom element: React, Vue, Svelte, Solid
- Tailwind CSS 4 + lucide
- Zod (validasi form)
- TanStack (Form, Query, Hotkeys, Pacer, Store) + TipTap
- Appwrite 28 TablesDB (database `notain_db`)
- Cloudflare Pages (host statis + Pages Functions) + R2 (bucket `notain`)
- `mailer/` — layanan Node 22 terpisah untuk email, memakai `@sendust/ts`
  (native addon, tidak bisa jalan di Worker) dan dijalankan sebagai
  **Appwrite Function** (`mailer/src/appwrite.mjs`). Lihat
  [`docs/features/email.md`](./docs/features/email.md).
- Vitest + Playwright + ESLint + Prettier

## Perintah

| Command              | Action                                             |
| :------------------- | :------------------------------------------------- |
| `npm install`        | Install dependencies                               |
| `npm run dev`        | Dev server (background) di `http://localhost:4321` |
| `npm run dev:status` | Cek status dev server                              |
| `npm run dev:logs`   | Lihat log dev server                               |
| `npm run dev:stop`   | Matikan dev server                                 |
| `npm run build`      | Build statis ke `./dist/`                          |
| `npm run preview`    | Preview hasil build                                |
| `npm run test`       | Unit test (Vitest, offline)                        |
| `npm run test:e2e`   | E2E (Playwright, offline)                          |
| `npm run smoke`      | Smoke test live ke Appwrite Cloud                  |
| `npm run lint`       | ESLint                                             |
| `npm run format`     | Format dengan Prettier                             |
| `npm run typecheck`  | `astro check` (typecheck TS + Astro)               |
| `npm run db:ensure`  | Appwrite schema: dry-run; `-- --yes` menerapkan     |

Tiga perintah tambahan supaya tidak perlu menghafal urutannya:

- `npm run check` — rapikan dulu (`vp fmt .`), lalu verifikasi: format check,
  lint, semua test, typecheck. Jalankan sebelum push; kalau ada yang bisa
  dirapikan formatter, perintah ini yang merapikannya.
- `npm run test:mailer` — test `mailer/` dengan runner bawaan Node. Tidak perlu
  `npm install` di `mailer/` dan tidak menyentuh jaringan.
- `npm run test:e2e:install` — unduh Chromium sekali sebelum `npm run test:e2e`.

## Rute

`/` landing · `/login` · `/register` · `/dashboard` · `/settings` ·
`/templates` · `/templates/new` · `/templates/<id>` ·
`/invoice/new` · `/invoice/<id>` · `/invoice/print` ·
`/probes` (uji batas antar framework) ·
`/api/logo` (Pages Function, bukan halaman)

`/invoice/<id>` dan `/templates/<id>` bukan route server: Pages Function
(`functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts`) menyajikan shell
halaman edit di balik path itu tanpa mengubah URL di address bar, dan
`astro dev` punya middleware kembarannya. Tautan lama — `/invoice/edit?id=…` dan
`/templates/edit` — di-redirect 302 ke URL kanonik itu, jadi setiap invoice dan
template punya satu URL saja.

## Struktur

```text
src/
├── pages/            # Route Astro (statis; semua logika di island)
├── layouts/          # Layout umum + DashboardLayout
├── components/
│   ├── react/        # Island utama: auth, invoice, template, dashboard, ui
│   ├── vue/          # Vue picker (custom element)
│   ├── svelte/       # Svelte items grid (custom element)
│   └── solid/        # Solid inspector (custom element)
├── core/             # Domain murni: invoice, template, profile, shared
├── app/              # Use-case (otentikasi, invoice, template, profile)
├── ports/            # Kontrak repository
├── infra/            # Implementasi Appwrite + Cloudflare R2
├── appwrite/         # Klien, konfigurasi tabel, mapper, izin
├── lib/              # Util UI, query hooks, cetak, autosave
└── styles/           # Theme tokens + print.css

functions/            # Pages Function: API logo di atas bucket R2
└── api/logo.ts       # POST unggah | logo/[key].ts GET baca, DELETE hapus

scripts/              # Tooling Appwrite: schema.mjs (satu daftar tabel) +
                      # ensure.mjs (satu perintah), migrasi, reset dev
```

## Data & privasi

- Auth dan database dikelola Appwrite Cloud; setiap baris punya
  izin per-pemilik (`rowSecurity: true`), jadi pengguna lain tidak bisa membaca
  datanya.
- Logo disimpan di bucket R2 **privat** (`notain`). Bucket tidak punya URL
  publik dan tidak ada kredensial S3 di browser: semua baca/tulis lewat
  Pages Function `functions/api/logo.ts`, yang memverifikasi sesi Appwrite
  pemanggil lewat JWT sebelum menyentuh R2. Lihat
  [catatan arsitektur](./docs/architecture/README.md).
- Tabel: `organizations`, `memberships`, `profiles`, `invoices`, `templates`,
  `customers`, `catalog`, `stats`, `payments`, `audit_logs`, `support`,
  `password_resets`. Kolom, index, dan izinnya di
  [`docs/data-model.md`](./docs/data-model.md); semuanya dideklarasikan di
  `scripts/schema.mjs` dan diterapkan dengan `npm run db:ensure`. Tabel
  `templates` menyimpan layout, tema, dan default rich text; invoice menyimpan
  **referensi** `templateId` (tanpa snapshot), jadi mengedit template
  memperbarui invoice yang memakainya.
- PDF dihasilkan lewat dialog cetak browser (`/invoice/print`), bukan library
  sisi klien — lihat [ADR 0007](./docs/architecture/adr/0007-print-based-pdf.md).

## Deploy (Cloudflare Pages)

Proyek Pages: **notain** → https://notain.pages.dev

```bash
npm run build
npx wrangler pages deploy dist --project-name=notain --branch main
```

- Tanpa server atau Docker: `dist/` diunggah sebagai aset statis, dan
  `functions/` dikompilasi terpisah jadi Pages Function (dibuktikan: route
  `/api/logo` hidup setelah direct upload).
- Variabel Pages (termasuk binding R2) dibaca dari **`wrangler.toml`** — bukan
  `.env`, yang hanya menyuplai build Vite.
- `astro dev` tidak menjalankan Pages Function. `astro.config.mjs` meneruskan
  `/api` ke deployment produksi supaya alur logo tetap bisa dicoba lokal; untuk
  menguji perubahan pada `functions/`, jalankan `npx wrangler pages dev dist`.
- Email dikirim oleh **Appwrite Function** terpisah (`mailer/src/appwrite.mjs`),
  karena `@sendust/ts` native addon tidak bisa dimuat Worker. Domainnya ada di
  `wrangler.toml` `[vars]` (`MAIL_SERVICE_URL`), dan hanya
  `MAIL_SERVICE_TOKEN` yang disimpan sebagai repository secret — workflow
  menuliskannya ke Pages sebelum deploy. Tanpa token itu semua `/api/mail/*`
  menjawab 503 dan sisa aplikasi tidak terpengaruh.
