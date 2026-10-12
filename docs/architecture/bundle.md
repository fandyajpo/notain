# Bundle: sebelum & sesudah integrasi

Angka ukur, bukan klaim. Kolom **Sebelum** diambil dari `npm run build` pada baseline
pra-integrasi; kolom **Sesudah** diukur ulang pada 2026-10-12 (Node 22.23.1,
Astro 7.3.7, Vite 8.3.3 / Rolldown) sesudah `pdf-lib` dihapus
([ADR 0007](adr/0007-print-based-pdf.md)), sesudah editor template
(`/templates`, `/templates/edit`) ditambahkan, sesudah Fase 3 editor
(lebar blok, wallpaper, ikon blok), sesudah entitas `customers`
(direktori customer untuk picker), dan sesudah pemulihan akun
(`/forgot-password`, `/reset-password`).

## Ringkasan

|                               | Sebelum | Sesudah | Δ                                                                                                        |
| ----------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------- |
| Total `dist/`                 | 1812 KB | 1752 KB | **−60 KB (−3,3%)**                                                                                       |
| Jumlah chunk `_astro/*.js`    | 6       | 43      | +37                                                                                                      |
| Halaman                       | 7       | 13      | +6 (`/probes`, `/invoice/print`, `/templates`, `/templates/edit`, `/forgot-password`, `/reset-password`) |
| Chunks melewati ambang 500 KB | 1       | **0**   | −1                                                                                                       |

Empat framework sekarang ikut terbundel. Sebagian besar pertambahan chunk adalah runtime
yang memang tidak ada sebelumnya, bukan kode duplikat — dan `dist/` sekarang **lebih
kecil daripada baseline**, karena `pdf-render.*.js` (424 129 B) ikut hilang bersama
`pdf-lib`.

## Chunk baru (tidak ada di baseline)

| Chunk                          | Bytes        | gzip        | Isi                                                                          |
| ------------------------------ | ------------ | ----------- | ---------------------------------------------------------------------------- |
| `runtime-dom.esm-bundler.*.js` | 79 819       | 30 376      | Vue runtime                                                                  |
| `client.NSKeN5bn.js`           | 53 106       | 19 953      | Vue `defineCustomElement` + runtime-core                                     |
| `calc-inspector.*.js`          | 24 188       | 7 911       | Solid inspector + signal; juga memuat `ItemsGrid` Svelte yang kini responsif |
| `web.*.js`                     | 13 880       | 5 448       | `solid-js/web` (`render`, `insert`)                                          |
| `client.svelte.*.js`           | 889          | 528         | Svelte CE bridge                                                             |
| `template-edit-app.*.js`       | 21 789       | 6 535       | Editor template (blok, tema, wallpaper)                                      |
| `templates-app.*.js`           | 5 491        | 1 896       | Daftar template                                                              |
| `template-picker.*.js`         | 2 440        | 1 181       | Kartu thumbnail + langkah pilih template                                     |
| **Jumlah chunk baru**          | **≈ 199 KB** | **≈ 73 KB** |                                                                              |

## Chunk yang berubah

| Chunk                  | Sebelum   | Sesudah     | Δ           | Catatan                                                                                           |
| ---------------------- | --------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `invoice-builder.*.js` | 836 KB    | 33 835 B    | **−96,0%**  | Lihat "Code-splitting" di bawah; +1,4 KB hook `customers`; baris tombol aside jadi grid di mobile |
| `rich-editor.*.js`     | —         | 395 246 B   | baru        | TipTap, di-`import()` via `React.lazy`                                                            |
| `island-boundary.*.js` | 244 KB    | 227 702 B   | −16 KB      | React Query core (dulu di-_chunk_ `providers.*.js`)                                               |
| `client.KF1t-_eb.js`   | 208 KB    | 209 117 B   | ±0          | React DOM, hash identik                                                                           |
| `landing-app.*.js`     | 168 KB    | 168 264 B   | ±0          | Halaman statis, tak tersentuh                                                                     |
| `useForm.*.js`         | 60 KB     | 58 467 B    | −2 KB       | Perubahan code-splitting                                                                          |
| `use-invoices.*.js`    | 36 KB     | 6 778 B     | −29 KB      | Kembali jadi chunk sendiri setelah `invoice-builder` mengecil                                     |
| `invoice-new-app.*.js` | —         | 2 613 B     | baru        | Langkah pilih template + `InvoiceBuilder`; mode salin `?from=`                                    |
| `print-app.*.js`       | —         | 2 994 B     | baru        | Halaman cetak, mount terpisah dari builder                                                        |
| `use-templates.*.js`   | —         | 1 435 B     | baru        | Query kunci templates                                                                             |
| `pdf-render.*.js`      | 424 129 B | **dihapus** | **−424 KB** | `pdf-lib` dihapus; cetak lewat browser (ADR 0007)                                                 |

## Code-splitting `invoice-builder` (dikerjakan)

`invoice-builder` melewati ambang 500 KB Vite (849 KB sebelum optimasi, sudah terjadi
sejak **sebelum** integrasi framework di 836 KB). Tiga library penyumbang terbesar
dikeluarkan lewat dynamic import; yang keempat akhirnya dihapus seluruhnya.

### 1. `pdf-lib` — dihapus, bukan defer

Fasad `src/lib/pdf.ts` dan seluruh `src/lib/pdf-render.ts` sudah dihapus, bersama
`src/core/shared/html.ts`. Tombol PDF kini membuka `/invoice/print` di tab baru dan
memanggil `window.print()`; lihat [ADR 0007](adr/0007-print-based-pdf.md).

Konsekuensi bundle: chunk `pdf-render.*.js` (424 129 B / 176 497 gzip) hilang dari
`dist/`, dan `pdf-lib` (4 paket) hilang dari `package.json`.

### 2. TipTap — code-split, bukan defer

`RichEditor` dibungkus `React.lazy` + `Suspense` di `lazy-rich-editor.tsx`.
Tiga editor di form invoice tetap dirender langsung, jadi TipTap tetap ikut dimuat —
tapi secara **asinkron, di luar critical path**, dan `invoice-builder` tidak lagi
menunggunya. Fallback `Suspense` mempertahankan tinggi layout supaya section tidak
meloncat.

### Hasil

|                           | Sebelum | Sesudah | Δ          |
| ------------------------- | ------- | ------- | ---------- |
| `invoice-builder` (bytes) | 851 229 | 33 835  | **−96,0%** |
| `invoice-builder` (gzip)  | 309 817 | 11 852  | **−96,2%** |
| Chunks > 500 KB           | 1       | **0**   | −1         |
| Total `dist/`             | 2012 KB | 1752 KB | −260 KB    |

Code-splitting murni memindahkan **kapan** kode dimuat; penghapusan `pdf-lib` yang
mengurangi **jumlah** kode.

## gzip

Angka yang sebenarnya dikirim ke browser, terurut menurut (2026-10-12):

| Chunk                          | gzip    |
| ------------------------------ | ------- |
| `rich-editor.*.js`             | 123 308 |
| `client.KF1t-_eb.js`           | 64 991  |
| `island-boundary.*.js`         | 60 093  |
| `landing-app.*.js`             | 53 096  |
| `runtime-dom.esm-bundler.*.js` | 30 376  |
| `client.NSKeN5bn.js`           | 19 953  |
| `useForm.*.js`                 | 13 962  |
| `dashboard-app.*.js`           | 13 491  |
| `invoice-builder.*.js`         | 11 852  |
| `builtins.*.js`                | 10 097  |
| `button.*.js`                  | 8 501   |
| `calc-inspector.*.js`          | 7 911   |
| `web.*.js`                     | 5 448   |
| `template-edit-app.*.js`       | 6 535   |

## Payload awal per halaman

Diukur di browser sungguhan (`astro preview`, Chromium, gzip) bukan dijumlahkan dari
tabel. Angka terakhir yang tercatat adalah **203 KB** JavaScript untuk `GET /invoice/new`
— sebelum penghapusan `pdf-lib`, dan **belum diukur ulang** sejak `pdf-render.*.js`
hilang. Chunk yang tidak ikut di payload awal saat itu: `pdf-render.*.js` (defer) dan
`rich-editor.*.js` (menyusul setelah React memasang `Suspense`); kini tinggal yang
kedua.

Sebelum optimasi, angka perkiraan halaman ini ≈ 420–450 KB (309 KB hanya dari
`invoice-builder`).

## Excel (CSV + XLSX) & rework dashboard — 2026-10-12

Sesi berikutnya menambahkan ekspor/impor Excel (CSV + XLSX), rework sidebar, halaman
`/invoices` & `/customers`, dan analytics dashboard. Ukuran mutlak diukur ulang:

|                               | Snapshot sesudah integrasi | Kini    | Δ           |
| ----------------------------- | -------------------------- | ------- | ----------- |
| Total `dist/`                 | 1752 KB                    | 2348 KB | **+596 KB** |
| Jumlah chunk `_astro/*.js`    | 43                         | 58      | +15         |
| Halaman                       | 13                         | 15      | +2          |
| Chunks melewati ambang 500 KB | 0                          | **0**   | ±0          |

**Pertambahan 596 KB hampir seluruhnya `xlsx` (492 120 B / 157 685 gzip) — dan itu
bukan beban halaman mana pun.** `xlsx` dimuat lewat dynamic `import()` pada
`src/lib/excel.ts` (`downloadXlsx` / `readFileRows`) dan hanya dieksekusi saat pengguna
menekan tombol Ekspor/Impor. Ia menjadi chunk async tersendiri
(`xlsx.*.js`, ≈ 492 KB) yang **tidak pernah masuk payload awal**; homepage, dashboard,
maupun builder tetap ringan seperti sebelumnya.

### Chunk baru

| Chunk                 | Bytes   | gzip    | Isi                                                                                        |
| --------------------- | ------- | ------- | ------------------------------------------------------------------------------------------ |
| `xlsx.*.js`           | 492 120 | 157 685 | SheetJS CE — **lazy**, hanya untuk `.xlsx` (unduh + baca); CSV lewat parser tangan sendiri |
| `invoices-app.*.js`   | 43 024  | 12 815  | Halaman faktur: header + `InvoiceTable` (pindah dari dashboard) + ekspor                   |
| `customers-app.*.js`  | 6 785   | 2 260   | Halaman customer: tambah/hapus + panel impor                                               |
| `export-buttons.*.js` | 4 096   | 2 062   | Tombol Ekspor CSV/XLSX reusable (getter asinkron, toast)                                   |

### Chunk yang menyusut

| Chunk             | gzip sesudah integrasi | gzip kini | Δ        | Catatan                                                 |
| ----------------- | ---------------------- | --------- | -------- | ------------------------------------------------------- |
| `dashboard-app`   | 13 491                 | 2 293     | **−83%** | `InvoiceTable` dipindah ke `invoices-app` (page-scoped) |
| `invoice-builder` | 11 852                 | 11 541    | −0,3%    | Tanpa perubahan material                                |

### Keamanan dependency

`xlsx` dari npm (0.18.5) membawa 2 CVE (prototype pollution GHSA-4r6h-8v6p-xvw6,
ReDoS GHSA-5pgg-2g8v-p4x9) tanpa perbaikan rilis. Solusi: pasang dari CDN resmi
SheetJS `0.20.3` (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — `npm audit`
kembali bersih (0 vulnerability). Detail dan rasionya di
[ADR 0002](adr/0002-ecosystem-scope.md) ("Diadopsi — dependency non-framework").
Jalur CSV sengaja tidak menyentuh SheetJS sama sekali (parser tangan + validasi Zod),
jadi berkas `.csv` yang berbahaya tidak pernah masuk ke parser library.

## Cara mengukur ulang

```bash
npm run build
du -sk dist
for f in dist/_astro/*.js; do printf '%9d %9d  %s\n' "$(stat -f%z "$f")" "$(gzip -c "$f" | wc -c)" "$(basename "$f")"; done | sort -rn
```

Baseline dicatat sebelum integrasi framework dan **dibulatkan ke KB**, jadi angka Δ di
tabel chunk bersifat perkiraan. Total `dist/` dan seluruh angka "sesudah" adalah ukuran
tepat dalam byte.
