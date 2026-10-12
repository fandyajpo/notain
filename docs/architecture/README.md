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
- Skema Appwrite — tabel `customers` adalah **direktori** customer, bukan sumber
  kebenaran atas invoice. Kolomnya: `ownerId`, `name`, `phone` (boleh null),
  `lastUsedAt`, dengan index `owner` atas `["ownerId"]` dan `rowSecurity: true`.
  **Tabel level permissions harus `["create(\"users\")"]`** — sama seperti `invoices`
  dan `templates`. Tanpa izin create di level tabel, `createRow` dari klien ditolak
  401 `user_unauthorized` ("No permissions provided for action 'create'"), karena
  `ownerRowPermissions` hanya menambah `read`/`update`/`delete` di level baris.
  Invoice tetap menyimpan salinan `customerName`/`customerPhone` sendiri, jadi
  menghapus customer tidak mengubah dokumen yang sudah dikirim.
- Direktori customer — `rememberCustomer` di `src/app/customers.ts` dipanggil setiap
  invoice disimpan (fire-and-forget, tidak menunda redirect). Identitas customer adalah
  **nama + nomor telepon yang dinormalisasi** (`normalizePhone` di
  `src/core/customer/model.ts` melipat prefiks `62` jadi `0`), supaya `0812…` dan
  `+62812…` tidak jadi dua baris. Nomor yang disimpan tetap apa adanya; hanya kuncinya
  yang dilipat. Picker menggabungkan direktori dengan riwayat invoice
  (`mergeCustomerOptions`), dan baris "Tambah …" di `Picker.vue` mengisi nama yang
  belum terdaftar.
- Editor template — `/templates` (daftar) dan `/templates/edit` (editor). Semua aturan
  yang menentukan sebuah layout masih boleh disimpan hidup di
  `src/core/template/layout.ts` (fungsi murni, 18 test): blok wajib
  `letterhead`/`items`/`totals` tidak bisa dihapus atau disembunyikan, batas
  `TEMPLATE_LIMITS.maxBlocks` menolak blok baru, dan operasi no-op mengembalikan
  array yang sama supaya form tidak dianggap kotor. React hanya memanggil fungsi itu —
  tidak ada aturan yang disembunyikan di komponen. DnD memakai **HTML5 drag & drop
  native** plus tombol panah (kerja di keyboard dan sentuh), bukan library baru, sesuai
  ADR 0002.

- Smoke test live (`npm run smoke`) — satu-satunya jalur yang menyentuh Appwrite Cloud
  sungguhan; unit test dan Playwright sengaja offline. Cakupannya: auth, profil, logo,
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
