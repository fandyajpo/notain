# ADR 0008 — Nota sebagai bahan visual, bukan kartu SaaS

- Status: **Superseded oleh [ADR 0009](0009-one-sheet.md)** (bahannya tetap dipakai; cakupannya diperluas dari hero ke seluruh halaman)
- Tanggal: 2026-11-25
- Konsekuensi: `src/styles/global.css`, `src/components/react/landing/hero.tsx`

## Konteks

Produknya nota, tetapi tampilannya berbicara bahasa lain: kartu putih membulat,
glow biru yang berdenyut di belakang preview, chip mengambang, dan pola titik di
latar. Semua itu bisa ditukar dengan landing SaaS apa pun tanpa ada yang hilang —
padahal yang dijual di sini justru dokumennya: kertas, angka, dan cap toko.

## Keputusan

Tiga bahan, satu permukaan berani.

1. **Kertas** — `--color-paper` (#fdfcf9) lebih terang dan lebih netral daripada
   kanvas (#f8f8f6), dan `--color-ink` (#1a1a17) lebih pekat daripada teks UI
   (#171717). Hanya permukaan yang *memang* nota yang memakai pasangan ini.
2. **Baris sobek** — `receipt-sheet`: dua garis putus-putus di atas dan bawah
   (bukan bingkai penuh), plus gradasi tipis cahaya di bagian atas kertas.
   Strukturnya garis sobek, jadi ia terbaca sebagai kertas yang dipotong.
3. **Cap toko** — `receipt-stamp`: cincin tebal, huruf kecil bertracking lebar,
   miring −7°, tinta `currentColor`. Isinya nama usaha contoh dari template,
   bukan tulisan "LUNAS" palsu — capnya memperlihatkan pekerjaan produk.
4. **Angka till** — `--font-till` + `till-figure`: monospace sistem dengan
   `tabular-nums`, supaya kolom rupiah rata. Tidak ada webfont yang diunduh:
   tidak menambah dependency, dan CSP `font-src 'self' data:` tetap sah.

Pada halaman depan, satu-satunya permukaan yang berani adalah nota di hero:
kertas di dalam `TiltCard`, cap di sudut kanannya. Sisanya tetap tenang supaya
mata berhenti di sana.

Aksen **tetap biru maskot** (#2563eb) dan tidak dipindah ke ungu: maskotnya biru,
dan cap memakai `currentColor` aksen — jadi cap, tombol, dan maskot satu tinta.
Warna template invoice tetap `DEFAULT_THEME` (`core/template/model.ts`) yang sama.

## Yang dihapus

- Glow pulse (`bg-accent/12 blur-3xl`, animasi opasitas + skala 6 detik) di
  belakang preview: hiasan yang tidak berasal dari subjek.
- Loop mengambang kartu (`y: [0, -10, 0]`, 7 detik): kertas nota diam di meja.
  Animasi masuk saat halaman dimuat tetap ada.

## Konsekuensi

- Utility baru dipakai hero; permukaan lain memakai token warna yang sama bila
  nanti butuh kertas (mis. tampilan cetak). Karena `@utility`, kelasnya tidak
  menghasilkan CSS sampai dipakai.
- Tidak ada perubahan fungsional: `InvoicePreview`, template, dan alur cetak tidak
  disentuh. Verifikasi: `npm run build` + `typecheck` di CI (lint sudah jadi
  gerbang deploy), dan tampilan dicek manual — sesi ini tidak punya screenshot.
