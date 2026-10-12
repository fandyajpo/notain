# Notain

Generator invoice/nota untuk UMKM Indonesia. Data disimpan di Appwrite Cloud
(auth, TablesDB, storage), template invoice bisa dikustomisasi lewat UI di
`/templates`, dan PDF dihasilkan lewat print-to-PDF browser.

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
`/invoice/print` · `/probes` (uji batas antar framework)

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
├── infra/            # Implementasi Appwrite
├── appwrite/         # Klien, konfigurasi tabel, mapper, izin
├── lib/              # Util UI, query hooks, cetak, autosave
└── styles/           # Theme tokens + print.css
```

## Data & privasi

- Auth, database, dan storage dikelola Appwrite Cloud; setiap baris punya
  izin per-pemilik (`rowSecurity: true`), jadi pengguna lain tidak bisa membaca
  datanya.
- Tabel: `profiles`, `invoices`, `templates`. Tabel `templates` menyimpan layout,
  tema, dan default rich text; invoice menyimpan **referensi** `templateId`
  (tanpa snapshot), jadi mengedit template memperbarui invoice yang memakainya.
- PDF dihasilkan lewat dialog cetak browser (`/invoice/print`), bukan library
  sisi klien — lihat [ADR 0007](./docs/architecture/adr/0007-print-based-pdf.md).

## Deploy (Render Static Site)

- Build command: `npm run build`
- Publish directory: `dist`
- Tanpa server atau Docker. Repository: GitHub → Render.
# notain
