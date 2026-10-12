# ADR 0007 — Cetak lewat browser, bukan `pdf-lib`

- Status: **Accepted**
- Tanggal: 2026-10-12
- Konsekuensi: `src/lib/print.ts`, `src/components/react/invoice/print-app.tsx`,
  `src/styles/print.css`, `src/pages/invoice/print.astro`

## Konteks

PDF invoice dibuat sepenuhnya di browser dengan `pdf-lib`: `src/lib/pdf.ts` jadi fasad
yang `await import('./pdf-render')`, dan `src/lib/pdf-render.ts` menggambar tiap elemen
ke koordinat tetap.

Dua masalah dengan itu:

1. **Renderer-nya tidak punya logika page-break.** Koordinat Y dihitung terus ke bawah
   tanpa memeriksa sisa ruang halaman, jadi invoice dengan banyak item melewati batas
   halaman dan baris-barisnya terpotong. Ini bug yang diketahui.
2. **Dua sumber kebenaran tampilan.** `InvoicePreview` menghasilkan tampilan layar lewat
   HTML/CSS; `pdf-render` menghasilkan tampilan cetak lewat pengukuran manual. Keduanya
   bisa berbeda diam-diam — dan memang berbeda, karena hanya yang satu yang punya
   layout fluid dan blok yang bisa dipakai ulang.

Menambah pagination ke `pdf-render` berarti menulis renderer tata layak kedua yang harus
dijaga sinkron dengan `InvoicePreview`, terus-menerus.

## Keputusan

PDF tidak lagi digambar di klien. Tombol **PDF** di builder membuka tab baru
`/invoice/print`, yang merender `InvoicePreview` yang sama persis, lalu memanggil
`window.print()`. User memilih **Save as PDF** di dialog cetak browser.

### Yang dihapus

- `pdf-lib` dari `package.json` (4 dependensi turunannya ikut hilang).
- `src/lib/pdf.ts` dan `src/lib/pdf-render.ts`.
- `src/core/shared/html.ts` + test-nya — `htmlToPlainText` hanya dipakai renderer PDF.
- Baris `pdf-render.*.js` (424 129 B) dari payload bundle.

### Mekanisme hand-off

Invoice dikirim lewat `sessionStorage` di bawah kunci `notain:print`, bukan lewat query
string: URL dibatasi (±2 KB di sebagian browser), sedangkan satu invoice bisa berisi
ratusan item plus tiga blok rich text.

```ts
// src/lib/print.ts
export function openPrintView(invoice: InvoiceDraft): boolean {
  sessionStorage.setItem('notain:print', JSON.stringify(invoice));
  const opened = window.open(`${PRINT_PATH}?auto=1`, '_blank');
  if (opened) return true;
  window.location.assign(PRINT_PATH); // popup diblokir → tab sekarang
  return false;
}
```

- **`window.open` dipanggil sinkron dari handler klik.** Hak izin popup melekat pada
  gestur user dan hilang begitu ada `await`. Karena itu `downloadPdf` yang dulu `async`
  (fetch logo → render → unduh) diganti handler sinkron; halaman cetak sendiri yang
  mengambil profile dan template-nya.
- **Sengaja tidak memakai `noopener`.** Handle itulah yang dipakai untuk mendeteksi
  popup yang diblokir; tanpanya fallback ke tab sekarang tidak akan pernah berjalan.
  `window.open` hanya pernah membuka origin sendiri.
- **`?auto=1` hanya dipasang builder.** `window.print()` hanya jalan bila query itu ada,
  jadi `/invoice/print` yang dikunjungi langsung tetap bisa dibaca — dan test
  Playwright mengunjunginya tanpa query itu supaya dialog cetak tidak muncul.
- **Payload divalidasi secara struktural** dengan `invoiceDraftShapeSchema` (tanpa
  refinemen), sama seperti autosave: invoice yang sedang dikerjakan harus selamat.

### Mengapa browser lebih baik di sini

- **Page-break gratis.** Browser mengatur aliran halaman. `print.css` cukup menyatakan
  `@page { size: A4; margin: 14mm }`, `break-inside: avoid` per blok (kecuali tabel
  item), `break-inside: avoid` per baris, dan
  `thead { display: table-header-group }` supaya header tabel terulang di tiap halaman.
  Ini persis bug item > 40.
- **Satu sumber kebenaran.** Layar dan kertas berasal dari komponen yang sama. Blok
  template, tema, dan wallpaper otomatis ikut ke PDF tanpa kode tambahan.
- **`print-color-adjust: exact`** mempertahankan warna latar, jadi wallpaper dan bar
  aksen ikut tercetak (asalkan user mencentang _Background graphics_ — pesan ini
  ditampilkan di halaman cetak).

## Alternatif yang ditolak

**Menambah logika page-break ke `pdf-render`.**
Ditolak: mempertahankan dua renderer yang harus disinkronkan, dan menulis ulang aliran
halaman yang sudah diselesaikan browser.

**`InvoicePreview` → canvas → PDF.**
Ditolak: kehilangan teks yang bisa diseleksi, layout CSS diganti pengukuran manual, dan
page-break tetap harus ditulis sendiri.

**Mengirim payload lewat query string.**
Ditolak: batas panjang URL, dan ukuran invoice tidak terprediksi.

**Membuka tab cetak dengan `noopener`.**
Ditolak: tanpa handle, popup diblokir tidak bisa dideteksi dan fallback tidak pernah
dipakai.

**Tetap `pdf-lib` untuk menjaga hasil PDF identik antar mesin.**
Ditolak: keseragaman itu dibeli dengan bug page-break dan renderer kedua. Bila suatu
saat butuh hasil yang benar-benar identik, jalur yang benar adalah render di server
(Appwrite Functions), bukan renderer klien kedua.

## Konsekuensi

- Hasil PDF **bergantung pada browser dan OS** (font, spacing). Layout dikunci oleh
  `print.css`, jadi selisihnya kosmetik. Untuk invoice ini diterima.
- **Dialog cetak adalah langkah manual.** Tidak ada lagi "klik sekali, file turun".
- **Watermark/wallpaper butuh centang _Background graphics_** di dialog cetak;
  pesannya ditampilkan di halaman cetak.
- Halaman cetak hanya terisi dari `sessionStorage`, jadi membuka `/invoice/print`
  langsung menampilkan "Tidak ada invoice untuk dicetak".
- Pengujian unit memakai jsdom. Jalur fallback `location.assign` memang tidak bisa
  dijalankan sungguhan di jsdom, jadi test-nya mengonfirmasi return value dan payload,
  bukan navigasinya.
