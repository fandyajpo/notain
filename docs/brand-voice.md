# Panduan Suara Notain & Token Gerak

Aturan tunggal untuk semua teks yang dilihat pengguna (landing page + aplikasi)
dan token gerak yang dipakai bersama. Teks melanggar aturan di bawah = bug
copy, sama seperti error typecheck.

## Suara

Notain terdengar seperti rekan kerja yang cakap: percaya diri tanpa
menjanjikan hal yang berlebihan, ringkas tanpa kehilangan informasi, ramah
tanpa kekanak-kanakan. Produknya menyangkut invoice dan uang, jadi nadanya
harus terasa tepat dan bisa dipercaya.

1. **Manfaat dulu, mekanisme belakangan.** Sebut apa yang didapat pengguna,
   baru cara kerjanya.
   - "Diskon dan pajak dihitung otomatis, jadi total tidak pernah meleset."
   - Bukan: "Sistem kami menggunakan kalkulator otomatis untuk menghitung."
2. **Kalimat pendek, satu ide.** Satu kalimat panjang dengan dua koma dan
   "dan" berulang hampir selalu bisa dipotong jadi dua.
3. **Kata kerja konkret untuk CTA.** "Buat invoice gratis", "Kirim undangan",
   "Simpan" — bukan "Mulai sekarang", "Lanjutkan", "Klik di sini".
4. **Bahasa Indonesia alami.** Hindari terjemahan kaku ("pengguna dapat
   melakukan"), jargon marketing ("solusi revolusioner"), dan emoji. Angka,
   janji, dan klaim harus bisa dibuktikan dari produk yang ada — jangan
   mengarang fitur atau testimoni.
5. **Konsisten satu halaman ke halaman berikutnya.** Istilah yang sama
   ditulis sama di landing, aplikasi, toast, dan notifikasi.

## Konsistensi istilah

| Pakai                                             | Jangan                                       | Catatan                                                                            |
| ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| invoice                                           | Invoice, tagihan (kecuali konteks "menagih") | Produknya sendiri; huruf kecil di tengah kalimat                                   |
| pelanggan                                         | customer, klien, konsumen                    | "klien" hanya bila konteksnya memang klien proyek                                  |
| nota                                              | —                                            | Boleh untuk konteks UMKM/warung, jangan campur dalam satu kalimat dengan "invoice" |
| plan Free / Pro / Business                        | paket, tier                                  | Nama plan ditulis Title Case                                                       |
| langganan                                         | subscription, berlangganan (kata benda)      |                                                                                    |
| kata sandi                                        | password, passphrase                         |                                                                                    |
| WhatsApp, PDF, Excel, CSV, API, webhook, checkout | —                                            | Istilah teknis yang boleh tetap Inggris                                            |
| usaha / bisnis                                    | brand, entitas                               | "usaha" untuk UMKM, "bisnis" untuk penjelasan umum                                 |

**Casing:** sentence case untuk judul, tombol, dan label — "Buat invoice
gratis", "Buat organisasi baru". Title Case hanya untuk nama plan dan nama
produk pihak ketiga. Semua huruf kapital hanya untuk eyebrow/tracking-widest.

## Gerak

Prinsip: gerak menjelaskan, tidak menghias. Satu sistem untuk landing dan
aplikasi — token ada di `src/styles/global.css`, easing reveal di
`src/components/react/landing/reveal.tsx` (`EASE`, yang meniru
`--ease-smooth`).

| Token             | Nilai                               | Dipakai untuk                             |
| ----------------- | ----------------------------------- | ----------------------------------------- |
| `--ease-smooth`   | `cubic-bezier(0.22, 1, 0.36, 1)`    | semua transisi UI (modal, popover, toast) |
| `--ease-spring`   | `cubic-bezier(0.34, 1.56, 0.64, 1)` | pantulan ringan, jangan untuk teks        |
| `--duration-fast` | `150ms`                             | hover, focus, warna tombol                |
| `--duration-base` | `300ms`                             | drawer, transisi konten                   |
| `--duration-slow` | `500ms`                             | reveal satu kali saat masuk viewport      |

Aturan:

- Entrance: opacity + translateY kecil (8–32px), 0.5–0.7s, stagger maksimal
  ~0.08s per item. Jangan menunda paint pertama — elemen di layar pertama
  pakai `initial={false}` / langsung tampil.
- Micro-interaction: 150–250ms, hanya `transform`/`opacity`/`color`.
- Loop ambient (aurora, float, marquee) maksimal satu-dua per layar, dan
  berhenti saat `prefers-reduced-motion`.
- Seluruh gerak tunduk pada `prefers-reduced-motion`: `MotionConfig
  reducedMotion="user"` di island, blok `@media` di `global.css` untuk CSS.
- Jangan membuat layout shift; skeleton harus berukuran sama dengan konten
  yang menggantikannya.
