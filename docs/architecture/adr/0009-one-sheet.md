# ADR 0009 — Satu lembar kertas, bukan sebelas kartu

- Status: **Accepted** (menggantikan [ADR 0008](0008-receipt-brand.md))
- Tanggal: 2026-11-27
- Konsekuensi: `src/styles/global.css`, `src/lib/ui/classes.ts`,
  `src/pages/index.astro`, `src/pages/pricing.astro`,
  `src/components/react/landing/*`

## Konteks

ADR 0008 sudah menetapkan bahannya — kertas, baris sobek, cap toko, angka
till — tetapi hanya di hero. Sisanya masih bahasa landing SaaS: kanvas abu
hangat, sebelas band yang bergantian `bg-card` dan polos, setiap band
`py-20 sm:py-28`, setiap blok muncul dengan fade-and-lift yang sama, marquee
berjalan, dan kisi kartu ikon–judul–teks. Halaman jadi sekitar sepuluh layar
untuk tujuh gagasan, dan yang paling menonjol justru animasi masuknya, bukan
produknya.

## Keputusan

Halaman depan **adalah satu nota**: selembar kertas, bukan kumpulan kartu.

1. **Kertas jadi latar, bukan kartu.** Halaman marketing memakai `bg-paper`
   (#fdfcf9) dan `text-ink` (#1a1a17). Permukaan yang *memang* nota — contoh di
   hero, demo di bangku kerja — satu tingkat lebih terang (`card`, putih) di
   atasnya, jadi dokumen terbaca sebagai benda yang diterangi, halaman sebagai
   mejanya. Aplikasi tetap memakai `background` netral: chrome-nya software,
   bukan alat tulis.
2. **Garis, bukan bayangan.** Antar bagian hanya ada satu hairline
   `border-rule`. Kartu hanya dipakai bila isinya memang panel kerja, dan
   radiusnya tetap 12–16px (`--radius-card`). Tidak ada border **dan** shadow
   pada permukaan yang sama.
3. **Satu irama.** `MARKETING_SECTION` + `MARKETING_BOX` di `lib/ui/classes.ts`
   memegang jarak semua bagian: `py-10 sm:py-14`, bukan `py-20 sm:py-28`. Lebar
   isi turun ke `max-w-5xl` supaya terbaca seperti dokumen.
4. **Tujuh bagian, bukan sebelas.** Marquee audiens jadi satu kalimat. Tiga
   demo (hitung, kirim, status) jadi satu *bench* bertab — nota yang sama di
   tiga momen, dan tabnya membawa id `#hitung`, `#kirim`, `#kenapa` supaya
   tautan footer tetap mendarat di tempat yang benar. Tiga kartu harga jadi
   daftar harga tiga baris. Kartu penutup jadi satu baris beralas.
5. **Gerak hanya dua.** Kata-kata judul naik dari balik mask, dan kertas
   tercetak turun di hero — satu rangkaian saat halaman dibuka. Semua gerak lain
   adalah jawaban atas tindakan: tab, stepper, pesan yang mengetik dirinya,
   cap status yang jatuh. `Reveal` dan `SectionHeading` (fade-and-lift per
   bagian) dihapus dari `landing/reveal.tsx`.
6. **Satu tinta aksen.** Biru maskot (#2563eb) hanya untuk angka uang, aksi
   utama, dan cap. Judul tidak lagi menaruh satu frasa berwarna.
7. **Tanpa dekorasi yang tidak berasal dari subjek.** Aurora (tiga blob blur
   yang bergerak), pola titik di halaman marketing, backdrop-blur di belakang
   drawer, chip melayang di hero, dan badge "Harga" di atas judul: semuanya
   dihapus. Label kolom footer ditulis sentence case, bukan huruf kapital
   bertracking.

Header dan footer ikut jadi bagian dari lembar: tinggi 56px, latar `paper`,
garis `rule`, tombol menu 44px, veil `bg-ink/25` tanpa blur.

## Konsekuensi

- Ukuran halaman turun sekitar setengah: jarak antarbagian dipotong ~50%, tiga
  bagian demo digabung, dan kartu harga jadi daftar.
- `audience-marquee.tsx` diganti `audience.tsx`; `aurora.tsx` dihapus;
  `Reveal`/`SectionHeading` dihapus dari `reveal.tsx` (tersisa `EASE` dan
  `SplitWords`). `@keyframes marquee` dihapus dari `global.css`.
- Tab bench menyinkronkan `location.hash`, jadi tautan lama `#kirim`/`#kenapa`
  di footer tetap membuka panel yang dimaksud, bukan hanya menggulir.
- `tests/landing-anchors.test.ts` tetap menjadi penjaga: setiap tautan
  `#bagian` di header/footer harus punya elemen ber-id di `landing/`.
- Tidak ada perubahan fungsional: template, alur cetak, harga, dan teks fakta
  tidak disentuh. Verifikasi lewat CI (`lint` + `build`); tampilan akhirnya
  dilihat di `notain.pages.dev`.
