# ADR 0004 — Island memakai light DOM, bukan shadow root

- Status: **Accepted**
- Tanggal: 2026-10-11
- Konsekuensi: `shadowRoot: false` (Vue), `shadow: 'none'` (Svelte), tanpa `attachShadow` (Solid)

## Konteks

Custom element default-nya punya shadow DOM: terisolasi stylesheet dan tidak ada
interferensi dari luar. Itu bagus untuk komponen yang dipakai lintas aplikasi.
Tapi Notain punya dua kebutuhan yang bertabrakan dengannya:

1. Seluruh UI app memakai **Tailwind 4** lewat Vite plugin, bukan CSS modules atau
   constructable stylesheet. Tailwind menghasilkan satu stylesheet global.
2. Event dari island harus **menggelembung ke host** supaya React bisa mendengarnya
   dengan `addEventListener` (ADR 0001).

## Keputusan

Ketiga island memakai **light DOM** — konten dirender langsung sebagai anak host,
tanpa `shadowRoot`.

| Framework | Cara menonaktifkan shadow                                                        |
| --------- | -------------------------------------------------------------------------------- |
| Vue       | `defineCustomElement(Comp, { shadowRoot: false })`                               |
| Svelte 5  | `<svelte:options customElement={{ tag, shadow: 'none' }} />`                     |
| Solid     | Tidak perlu — tidak ada wrapper yang bikin shadow; `render()` langsung ke elemen |

### Keuntungan

- **Tailwind berlaku otomatis.** Kelas di `.svelte`/`.vue`/`.tsx` Solid dipakai apa adanya.
  Tidak ada `::part()`, tidak ada `<style>` per island, tidak ada risiko utility class
  dobel.
- **Event menggelembung ke host.** Ini syarat dari ADR 0001. Di shadow DOM, event
  dikompresi oleh `composed` dan harus disetel `composed: true` satu per satu; di light
  DOM cukup `bubbles: true`.
- **Inspector visual di devtools utuh.** Melihat `<notain-items-grid>` di Elements
  panel langsung menunjukkan tabelnya, bukan `<#document-fragment>` kosong.
- **`querySelector` sederhana.** Test jsdom dan smoke test bisa mencari
  `[data-item-row]` dari host tanpa menembus shadow root.

### Konsekuensi negatif yang diterima

- **Tidak ada isolasi kelas.** Kelas Tailwind dari island bisa bentrok dengan app.
  Diterima karena justru kebalikannya yang diinginkan: island harus terlihat seperti
  bagian dari app.
- **Selector global bisa menembus island.** Misalnya `div table { … }` dari stylesheet
  app akan mengenai tabel di dalam grid. Risiko ini nyata tapi terkendali — grid
  memakai kelas Tailwind eksplisit, bukan element selector.
- **Rentan terhadap atribut peninggalan.** Kalau nanti perlu isolasi, jalurnya adalah
  membungkus ulang komponen dengan `<div class="[all:initial]">`, bukan mengubah
  keputusan ini.

### Mengapa bukan shadow DOM + Tailwind CDN/`@layer`

Alternatifnya adalah memasang Tailwind sebagai constructable stylesheet dan
menginjectnya ke tiap shadow root. Ditolak karena menambah mekanisme distribusi CSS
yang tidak dipakai di mana pun di app, hanya demi tiga widget internal. Island di
sini bukan komponen publik yang didistribusikan ke aplikasi orang lain — mereka bagian
dari satu app.

## Pemicu meninjau ulang

Kalau nanti Notain mau **menerbitkan** `notain-items-grid` sebagai komponen publik
(npm package, atau dipakai dari app lain), shadow DOM wajib kembali dievaluasi —
saat itu isolasi lebih penting daripada ikut memakai stylesheet host.

Sampai saat itu, ketiga island tetap light DOM.
