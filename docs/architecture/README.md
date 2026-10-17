# Arsitektur Notain

Dokumen keputusan arsitektur (ADR) dan catatan teknis untuk integrasi multi-framework di Notain.

> MVP Notain tetap satu tujuan: bikin invoice cepat, jadi PDF, kirim WhatsApp.
> Integrasi framework di sini **tidak menambah fitur** — ini latihan arsitektur untuk
> membuktikan boundary custom element bisa dipakai tanpa merusak dominasi React.

## Status ekosistem

| Framework                                  | Status                        | Bukti                                        |
| ------------------------------------------ | ----------------------------- | -------------------------------------------- |
| React 19                                   | **Adopted** — pemilik state   | `src/components/react/**`, semua JSX di sini |
| Svelte 5                                   | **Adopted** — item grid       | `ItemsGrid.svelte` + 12 test                 |
| Vue 3                                      | **Adopted** — picker riwayat  | `Picker.vue` + 10 test                       |
| Solid 1                                    | **Adopted** — inspector total | `CalcInspector.tsx` + 5 test                 |
| Astro                                      | **Adopted** — shell/routing   | `astro.config.mjs`, 11 halaman               |
| Lit                                        | _Evaluated — not adopted_     | ADR 0002                                     |
| Qwik, Angular, Marko, Preact, Alpine, htmx | _Evaluated — not adopted_     | ADR 0002                                     |

Status "evaluated — not adopted" bukan penolakan permanen. Pemicu untuk mengadopsi Lit
tercantum di ADR 0002.

## Daftar ADR

| ADR                                                  | Judul                                              | Status   |
| ---------------------------------------------------- | -------------------------------------------------- | -------- |
| [0001](adr/0001-custom-element-boundary.md)          | Boundary custom element antar framework            | Accepted |
| [0002](adr/0002-ecosystem-scope.md)                  | Cakupan ekosistem: Lit dievaluasi, yang lain tidak | Accepted |
| [0003](adr/0003-picker-data-from-invoice-history.md) | Data picker diturunkan dari riwayat invoice        | Accepted |
| [0004](adr/0004-light-dom-islands.md)                | Island memakai light DOM, bukan shadow root        | Accepted |
| [0005](adr/0005-data-props-via-layout-effect.md)     | Prop data wajib lewat layout effect                | Accepted |
| [0006](adr/0006-single-query-layer.md)               | Satu lapisan query, tanpa adapter per widget       | Accepted |
| [0007](adr/0007-print-based-pdf.md)                  | Cetak lewat browser, bukan `pdf-lib`               | Accepted |

## Catatan teknis

- [Framework compliance](framework-compliance.md) — bagaimana dominasi TanStack dan Zod
  tetap utuh setelah tiga framework lain masuk.
- [Bundle](bundle.md) — angka ukur sebelum/sesudah integrasi. Dukung, bukan klaim.
- [Caching & rate limiting](caching.md) — kebijakan cache per data, isolasi antar akun,
  dan batas jujur: **Appwrite** yang menegakkan rate limit, bukan aplikasi statis ini.
- [Playwright](playwright.md) — keputusan: **opsi B**. Delapan test browser di `/probes`,
  tanpa Appwrite. Dijalankan terpisah lewat `npm run test:e2e`.
- Skema Appwrite — pencarian invoice membutuhkan **fulltext index** di tabel `invoices`
  atas kolom `invoiceNumber`, `customerName`, dan `items`. Tanpa index itu
  `Query.search` ditolak Appwrite, jadi `serverSearchQuery` di
  `src/infra/appwrite-invoice-repository.ts` gagal 400. Index sudah dibuat di
  proyek berjalan; skema ulang harus membuatnya kembali.
- Skema Appwrite — tabel `templates` menyimpan layout, tema, dan default rich text tiap
  template invoice. Kolomnya: `ownerId`, `name`, `layout`, `theme`, `headerHtml`,
  `contentHtml`, `footerHtml`, `notes`, dengan index `owner` atas `["ownerId"]` dan
  `rowSecurity: true`. Tabel `invoices` menambah kolom `templateId` (string 64, boleh
  null) sebagai **referensi** — tidak ada snapshot, jadi mengedit template memperbarui
  semua invoice-nya. Tabel bawaan `classic`/`minimal`/`modern` tidak pernah dipersist;
  kodenya di `src/core/template/builtins.ts` dan selalu tersedia sebagai fallback.
  Invoice ↔ template diselesaikan oleh `resolveTemplate` di
  `src/core/template/resolve.ts`.
- Skema Appwrite — kolom `businessType` (string 64, boleh null) di `templates` dan
  `profiles` menyimpan **slug jenis bisnis** dari taxonomi di
  `src/core/business/taxonomy.ts` (19 kategori, 175 sub-jenis). `null` berarti "belum
  dipilih" (built-in, baris lama, profil baru). Konten per jenis — prose default,
  sample item, resep layout, saran satuan — ada di preset kategori
  `src/core/business/presets.ts` (kode, bukan data tersimpan). Field level invoice
  yang spesifik per jenis (nama kendaraan, berat kiloan, dst.) dikatalogkan di
  `src/core/business/detail-fields.ts` — default per kategori menggantung di preset,
  plus override per sub-jenis yang butuh set berbeda — dan disimpan per invoice di
  kolom `details` (JSON, boleh null) tabel `invoices`. Kolom dibuat lewat
  `npm run business-type:ensure` (dry-run; `-- --yes` untuk menerapkan) — **jalankan
  sebelum deploy yang membawa kode ini**, karena `createTemplate`/`saveProfile`/
  simpan invoice akan menulis kolom yang belum ada. Tidak ada index: pengelompokan
  picker terjadi di klien atas halaman yang sudah dimuat. Item invoice menyimpan
  `unit` di dalam JSON kolom `items`, jadi butirannya tidak butuh migrasi apa pun.
- Skema Appwrite — tabel `customers` adalah **direktori** customer, bukan sumber
  kebenaran atas invoice. Kolomnya: `ownerId`, `name`, `email` (boleh null),
  `phone` (boleh null), `lastUsedAt`, dengan index `owner` atas `["ownerId"]` dan
  `rowSecurity: true`.
  **Tabel level permissions harus `["create(\"users\")"]`** — sama seperti `invoices`
  dan `templates`. Tanpa izin create di level tabel, `createRow` dari klien ditolak
  401 `user_unauthorized` ("No permissions provided for action 'create'"), karena
  `ownerRowPermissions` hanya menambah `read`/`update`/`delete` di level baris.
  Invoice tetap menyimpan salinan `customerName`/`customerPhone`/`customerEmail`
  sendiri, jadi menghapus customer tidak mengubah dokumen yang sudah dikirim.
  Kolom `invoices.customerEmail` ditambahkan lewat
  `npm run migrate:customer-email` (jalankan sebelum deploy yang membawa kode email).
- Skema Appwrite — tabel `stats` adalah **cache ringkasan dashboard**, bukan sumber
  kebenaran: satu baris per akun (`ownerId` string 64) berisi enam counter integer
  (`totalInvoices`, `sentCount`, `paidCount`, `voidCount`, `totalCustomers`,
  `totalTemplates`, default 0), index `owner` atas `["ownerId"]`, izin tabel
  `["create(\"users\")"]` + `rowSecurity: true` (kontrak yang sama dengan
  `invoices`/`customers`/`templates`). `refreshDashboardStats`
  (`src/app/stats.ts`) menghitung ulang keenam angka dari tabel sumber lalu
  menulisnya balik — sekali per kunjungan dashboard, jadi drift antar kunjungan
  selalu sembuh sendiri. Pembacaan (`getDashboardStats`) bersifat best-effort:
  tabel belum dibuat (belum jalan `npm run stats:ensure`) akan mengembalikan
  `null` dan UI jatuh ke hitungan seperti sebelum ada cache. Skema dibuat oleh
  `scripts/ensure-stats.mjs` (dry-run tanpa argumen, terapkan dengan `--yes`);
  tidak ada backfill — barisnya dibuat sendiri pada kunjungan pertama.
- Direktori customer — `rememberCustomer` di `src/app/customers.ts` dipanggil setiap
  invoice disimpan (fire-and-forget, tidak menunda redirect). Sebuah baris cocok lewat
  identitas persis (email + nomor yang dinormalisasi — `normalizePhone` di
  `src/core/customer/model.ts` melipat prefiks `62` jadi `0`) **atau** lewat nama yang
  sama (case-insensitive): "Budi" dengan nomor baru meng-update baris Budi yang ada,
  bukan membuat baris kedua. Field yang diisi menimpa nilai tersimpan; field kosong tidak
  pernah menghapus data. Picker bersifat **select-only** dan menampilkan isi direktori
  customer saja (`mergeCustomerOptions`) — riwayat invoice hanya jadi fallback kalau
  direktori masih kosong (akun lama); contact baru terarsip otomatis lewat
  `rememberCustomer` saat invoice disimpan.
- Editor template — `/templates` (daftar), `/templates/new` (editor baru) dan
  `/templates/<id>` (editor isi). Kedua URL editor adalah **shell yang sama**
  (`dist/templates/new/index.html`), disajikan di balik path itu oleh
  `functions/templates/[[id]].ts` — lihat "Rute edit tanpa SSR"; `/templates/edit`
  di-redirect 302 ke URL kanonik. Semua aturan
  yang menentukan sebuah layout masih boleh disimpan hidup di
  `src/core/template/layout.ts` (fungsi murni, 18 test): blok wajib
  `letterhead`/`items`/`totals` tidak bisa dihapus atau disembunyikan, batas
  `TEMPLATE_LIMITS.maxBlocks` menolak blok baru, dan operasi no-op mengembalikan
  array yang sama supaya form tidak dianggap kotor. React hanya memanggil fungsi itu —
  tidak ada aturan yang disembunyikan di komponen. DnD memakai **HTML5 drag & drop
  native** plus tombol panah (kerja di keyboard dan sentuh), bukan library baru, sesuai
  ADR 0002.

- Logo di Cloudflare R2 — kontrak `AssetRepository`
  (`src/ports/asset-repository.ts`) tidak berubah, yang berganti hanya
  implementasinya. `R2AssetRepository` (`src/infra/r2-asset-repository.ts`)
  menembak Pages Function `functions/api/logo.ts` — POST unggah, GET
  `/api/logo/:key` baca, DELETE hapus — yang di atasnya ada binding bucket R2
  privat `notain` dari `wrangler.toml`. Bucket tidak punya URL publik dan tidak
  ada kredensial S3 yang sampai ke browser: pengunggahan mengirim JWT Appwrite
  (`account.createJWT()`), lalu Function memvalidasinya lewat `GET /v1/account`
  dengan header `X-Appwrite-JWT` — endpoint itu menjawab 200 **tanpa API key**,
  jadi tidak ada rahasia server yang disimpan di mana pun. Kepemilikan objek
  dicatat di `customMetadata.owner`, bukan disimpulkan dari nama berkas, karena
  satu `userId` boleh jadi prefiks `userId` lain; balasan DELETE untuk objek milik
  orang lain adalah 404, bukan 403, supaya keberadaan kunci tidak bocor. Respons
  baca selalu membawa `X-Content-Type-Options: nosniff` dan CSP `sandbox` — SVG
  yang diunggah boleh berisi skrip, dan ia disajikan dari origin kita sendiri.
  `PUBLIC_LOGO_API` default-nya path `/api/logo` supaya build tidak mengunci satu
  domain dan semua permintaan logo tetap same-origin (karenanya Function tidak
  perlu CORS); `astro dev` meneruskan `/api` ke deployment karena Astro tidak
  menjalankan Pages Function, dan smoke test menimpanya dengan URL absolut karena
  Node tidak punya origin.
- Smoke test live (`npm run smoke`) — satu-satunya jalur yang menyentuh backend
  sungguhan (Appwrite Cloud **dan** Pages Function logo); unit test dan Playwright
  sengaja offline. Cakupannya: auth, profil, logo,
  invoice, **templates** (CRUD, kolom JSON `layout`/`theme`, default rich text, serta
  isolasi antar-pengguna), dan **customers** (baris di-file saat invoice disimpan,
  nomor yang sama tidak jadi duplikat, isolasi antar-pengguna). Smoke ini yang
  menangkap bug mapper `templateRowToDomain`: satu `notes: null` dari Appwrite membuat
  seluruh objek `defaults` terlempar ke kosong oleh `.catch`, sehingga teks default
  template tidak pernah bertahan reload.
- Cetak menunggu query templates — `/invoice/print` baru dianggap siap ketika daftar
  template sudah termuat (kalau invoice punya `templateId`), supaya `window.print()`
  tidak sempat mencetak versi fallback bawaan yang layout-nya salah.
- Cetak tidak bergantung pada "Background graphics" — `print.css` mempertahankan
  **border** kartu, kartu customer, catatan, garis total, dan garis tabel (semuanya
  selalu tercetak), sehingga invoice tetap terbaca sebagai dokumen berbingkai walau
  checkbox itu dimatikan. Background (isi tema, rule aksen, wallpaper) hanya lapisan
  tambahan; kehilangannya tidak boleh menyisakan halaman kosong.
- Pulihkan akun (`createRecovery`/`updateRecovery`) — `/forgot-password` kirim tautan,
  `/reset-password` menerimanya lewat `?userId=…&secret=…` dari email. Layer Appwrite
  menelan `user_not_found` dan memperlakukan submit sebagai sukses, supaya endpoint
  tidak jadi orakel keberadaan akun (account enumeration). Link "Lupa password?" ada di
  form masuk. Tautan dibangun dari `window.location.origin` (`…/reset-password`), jadi
  hostname-nya harus terdaftar sebagai **Web platform** di konsol Appwrite. Host
  `localhost:4321` sudah terdaftar (terverifikasi: `createRecovery` diterima, sedangkan
  host acak ditolak `general_argument_invalid`); host deploy produksi harus didaftarkan
  sendiri sebelum recovery jalan di sana.
- Kedaluwarsa sesi ditangani global — 401 dari query mutation apa pun masuk ke satu
  handler di `src/lib/query/session-expiry.ts` (dipasang lewat `QueryCache`/
  `MutationCache` `onError`). Handler mengosongkan sesi yang di-cache, menyalakan
  `AuthGate`, memberi pesan ramah, lalu mengantar kembali ke `/login?next=…`. Draft
  baru ikut pulih lewat autosave `localStorage`. Ada penjaga anti-loop: expiry yang
  terdeteksi di halaman auth dibiarkan.
- Duplikat invoice — tombol "Duplikat" di dashboard membuka `/invoice/new?from=<id>`.
  `duplicateDraft` (core, murni) menyalin customer, item, diskon, pajak, prose, catatan,
  dan template, tapi memberi **nomor & tanggal baru** serta ID item baru (grid tidak
  boleh berbagi React key dengan sumbernya). Jatuh tempo mempertahankan offset hari
  aslinya ("net 14" tetap "net 14"). Langkah pilih template dilewati karena salinan
  sudah membawa `templateId` sumber. Builder menerima `restoreAutosave={false}` di mode
  ini — tanpa itu, autosave lama akan menimpa konten duplikat (builder menganggap
  salinan sebagai invoice baru karena `invoiceId` kosong).
- Nomor invoice urut dalam setahun (`INV-YYYY-NNN`), diturunkan dari nomor yang sudah
  ada lewat `nextInvoiceNumber`, bukan counter tersimpan. Keunikan penuh lintas-perangkat
  butuh constraint unik di server; untuk satu pengguna biasa angka ini sudah cukup.
- Rute edit tanpa SSR — `/invoice/<id>` dan `/templates/<id>` bukan route server, karena
  situs ini static dan daftar id hanya hidup di Appwrite. Yang ada adalah Pages
  Function (`functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts`) yang
  menyajikan shell halaman edit (`dist/invoice/edit/index.html`,
  `dist/templates/new/index.html`) di balik path itu lewat `env.ASSETS.fetch`, **tanpa
  pernah redirect** — redirect menaruh query string kembali di URL, dan mengganti URL
  adalah tujuan rute ini. Yang di-redirect adalah tautan lama: `/invoice/edit?id=…`
  dan `/templates/edit` menjawab 302 ke URL kanonik (targetnya dihitung
  `invoiceEditCanonicalTarget`/`templateEditCanonicalTarget` di `src/lib/edit-route.ts`),
  supaya setiap invoice dan template punya satu URL saja. `astro dev` tidak membaca
  `functions/`, jadi ada middleware kembaran di `astro.config.mjs` yang menulis ulang
  `req.url` ke shell yang sama dan meniru redirect 302 itu. Kedua sisi memakai pola
  segmen dan daftar segmen yang diimpor dari `src/lib/edit-route.ts`; hanya middleware
  yang menyalinnya secara manual (Node ESM tidak bisa mengimpor `.ts`), dan
  `e2e/edit-routes.spec.ts` lah yang menjaga keduanya tetap seirama.

## Peta direktori framework

```
src/components/
├── shared/       kontrak framework-neutral (Zod + CustomEvent + hook React)
├── react/        SEMUA JSX. Pemilik TanStack Form. Adapter tiap island.
├── svelte/       ItemsGrid.svelte + register.ts
├── vue/          Picker.vue + register.ts
├── solid/        CalcInspector.tsx + register.ts
└── custom-elements.ts   barrel registrasi side-effect
```

Aturan keras: **file `.svelte`/`.vue`/`.tsx` Solid tidak boleh diimpor dari
`.astro` atau dari luar `src/components/`**. Yang boleh disentuh aplikasi hanyalah
adapter React di `src/components/react/invoice/`.
