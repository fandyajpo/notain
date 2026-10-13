# Notain

Generator invoice/nota untuk UMKM Indonesia. Data disimpan di Appwrite Cloud
(auth, TablesDB), logo di Cloudflare R2, template invoice bisa dikustomisasi
lewat UI di `/templates`, dan PDF dihasilkan lewat print-to-PDF browser.

Spesifikasi lengkap: [`NOTAIN_MVP.md`](./NOTAIN_MVP.md).
Arsitektur, keputusan desain (ADR), bundle, dan caching:
[`docs/architecture/`](./docs/architecture/README.md).

## Stack

- Astro (static site) + TypeScript strict
- Empat framework dalam satu halaman via custom element: React, Vue, Svelte, Solid
- Tailwind CSS 4 + lucide
- Zod (validasi form)
- TanStack (Form, Query, Hotkeys, Pacer, Store) + TipTap
- Appwrite 28 TablesDB (database `notain_db`)
- Cloudflare Pages (host statis + Pages Functions) + R2 (bucket `notain`)
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

## Rute

`/` landing · `/login` · `/register` · `/dashboard` · `/settings` ·
`/templates` · `/templates/edit` · `/invoice/new` · `/invoice/edit` ·
`/invoice/print` · `/probes` (uji batas antar framework) ·
`/api/logo` (Pages Function, bukan halaman)

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
- Tabel: `profiles`, `invoices`, `templates`. Tabel `templates` menyimpan layout,
  tema, dan default rich text; invoice menyimpan **referensi** `templateId`
  (tanpa snapshot), jadi mengedit template memperbarui invoice yang memakainya.
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

# notain
