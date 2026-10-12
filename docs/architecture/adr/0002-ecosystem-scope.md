# ADR 0002 — Cakupan ekosistem: Lit dievaluasi, yang lain tidak

- Status: **Accepted**
- Tanggal: 2026-10-11

## Konteks

Notain diminta mendemonstrasikan integrasi lintas ekosystem, bukan sekadar
"React plus satu template engine". Daftar framework yang wajib dievaluasi meliputi
Lit, Qwik, Angular, Marko, Preact, Alpine, htmx, dan HTMX-like tools.

Pertanyaannya: mana yang benar-benar diadopsi, mana yang cukup dicatat sebagai
sudah dievaluasi, dan apa pemicu mengubah statusnya nanti?

Aturan yang berlaku di repo ini: **jangan menambah dependency hanya karena populer.**
Setiap dependency harus menyelesaikan pekerjaan yang belum selesai.

## Keputusan

### Diadopsi (3 framework island)

| Framework | Versi     | Pekerjaan       | Alasan                                                                                        |
| --------- | --------- | --------------- | --------------------------------------------------------------------------------------------- |
| Svelte 5  | `^5.57.2` | Item grid       | Compiling ke DOM tanpa runtime reaktivitas berat; rune state eksplisit cocok untuk tabel edit |
| Vue 3     | `^3.5.43` | Picker riwayat  | Composition API + `defineCustomElement` resmi dari core, tanpa plugin tambahan                |
| Solid 1   | `^1.9.17` | Inspector total | Tanpa virtual DOM, sinkron dengan signal; ideal untuk display-only yang sering berubah        |

Astro (`^7.3.7`) tetap shell/routing dan tidak dihitung sebagai island.

### Diadopsi — dependency non-framework

| Dependency          | Versi    | Pekerjaan                               | Alasan di luar kerangka framework                                                                               |
| ------------------- | -------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `xlsx` (SheetJS CE) | `0.20.3` | Ekspor/impor Excel (customer & invoice) | XLSX adalah arsip ZIP berisi XML; menulis/membacanya manual tanpa library tidak praktis dan rawan salah format. |

Ini memenuhi aturan yang sama: `xlsx` **menyelesaikan pekerjaan yang belum selesai**
(bukan sekadar populer). Detail penting:

- **Versi & sumber.** Dipasang dari CDN resmi SheetJS
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), bukan npm. Versi npm
  terakhir (`0.18.5`) membawa dua advisory berat — prototype pollution
  (GHSA-4r6h-8v6p-xvw6) dan ReDoS (GHSA-5pgg-2g8v-p4x9) — yang persis nargetin
  jalur **read** file, dan tidak punya fix di npm. `0.20.3` sudah menutup keduanya
  (`npm audit` bersih). Edisi komunitas (CE) tetap berlisensi Apache-2.0.
- **Lazy-load.** Dimuat lewat dynamic `import()` hanya saat pengguna membuka
  ekspor/impor, jadi ±900 KB-nya tidak masuk bundle awal — pola sama dengan
  code-splitting TipTap.
- **Jalur aman.** Impor CSV diparse sendiri tanpa SheetJS; SheetJS hanya dipakai
  untuk membaca `.xlsx` dan menulis `.xlsx`/`.csv`. Karena kedua advisory tadi ada
  di jalur read, setiap baris hasil impor tetap divalidasi Zod sebelum masuk domain.

### Dievaluasi — tidak diadopsi

**Lit** — dievaluasi paling serius karena paling dekat dengan "custom element asli".
Statusnya _evaluated — not adopted_.

Lit menawarkan `html` tag, reactive properties, dan lifecycle lengkap dalam ~5 KB.
Tapi Notain sudah punya tiga framework terpasang, dan ketiganya sudah punya
`defineCustomElement`/`customElement` resmi di core:

- Vue: `defineCustomElement(Comp, { shadowRoot: false })`
- Svelte 5: `<svelte:options customElement={{ tag }} />`
- Solid: class yang membungkus `render()` — 30 baris, ditulis sendiri

Menambah Lit berarti menambah **runtime keempat** untuk pekerjaan yang sudah selesai.
Itu melanggar aturan "jangan menambah dependency hanya karena populer".

Pemicu mengadopsi Lit, supaya status ini tidak jadi "tidak pernah":

1. Muncul kebutuhan widget yang **tidak** punya framework lain di repo (misalnya web
   component yang harus dipakai juga dari aplikasi non-Astro).
2. Salah satu dari Svelte/Vue/Solid harus dilepas, dan tersisa lebih dari dua widget
   yang butuh lifecycle reaktif.
3. `@astrojs/svelte`, `@astrojs/vue`, atau `@astrojs/solid-js` rusak/compatibility break
   di upgrade Astro mayor berikutnya dan tidak ada jalur migrasi.

Kalau salah satu pemicu terpenuhi, evaluasi ulang dimulai dari ADR 0004 (light DOM) dan
ADR 0005 (prop imperatif) — keduanya tetap berlaku apa pun runtime-nya.

**Qwik, Angular, Marko, Preact, Alpine, htmx** — dievaluasi sekali di awal, tidak
diadopsi, dan tidak dicatat sebagai kandidat:

- Qwik / Angular / Marko: ukuran runtime dan konvensi proyek (NgModule, resumability)
  tidak sepadan untuk tiga widget kecil. Masing-masing juga menuntut setup build sendiri.
- Preact: drop-in replacement React yang justru memperkeruh boundary — dua runtime
  yang tampak identik di dalam satu bundle.
- Alpine / htmx: pendekatan deklaratif lewat attribute. Berguna di halaman statis, tapi
  tidak punya cara menyatakan kontrak tipe. Di Notain, kontrak itu wajib (ADR 0001).

Status untuk keenamnya: **evaluated — not adopted, tanpa pemicu tercatat.**

## Keuntungan

- Batas jelas: tiga island, tiga widget, satu pemilik state.
- Dependency framework bertambah tepat tiga runtime, dan masing-masing punya alasan
  pekerjaan tertulis di tabel atas.
- Repo tidak jadi museum framework: yang dievaluasi dicatat beserta alasannya, bukan
  sekadar dipasang lalu ditinggalkan.

## Konsekuensi

- `package.json` membawa tiga framework sekaligus. Ini disengaja dan sudah diukur
  (lihat [bundle](../bundle.md)): total +204 KB dist, +165 KB di antaranya adalah runtime
  yang memang tidak ada sebelumnya.
- Siapa pun yang menambah island keempat wajib menambah baris di ADR ini dan di
  [README](../README.md), termasuk pekerjaan yang diembannya.
