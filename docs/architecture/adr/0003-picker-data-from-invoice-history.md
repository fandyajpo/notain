# ADR 0003 — Data picker diturunkan dari riwayat invoice

- Status: **Accepted**
- Tanggal: 2026-10-11
- Konsekuensi: `src/components/shared/picker-options.ts`

## Konteks

Picker riwayat butuh daftar customer dan barang untuk disarankan. Ada dua jalan:

1. Tabel `customers` dan `products` baru di Appwrite TablesDB.
2. Tidak bikin tabel. Turunkan daftar itu dari invoice yang sudah ada.

MVP Notain memang **tidak punya** entitas Customer dan Product —
`invoiceDraftSchema` menyimpan `customerName` dan `customerPhone` sebagai string
langsung di dokumen invoice, dan `items` sebagai array embedded.

## Keputusan

Daftar saran diturunkan dari invoice history lewat fungsi murni
`derivePickerOptions(invoices, limit)` di `src/components/shared/picker-options.ts`.
Tidak ada tabel baru.

### Aturan turunan

Ditulis sebagai keputusan, bukan implementasi detail, supaya bisa diuji ulang kalau
aturannya berubah:

- **Customer** dikelompokkan per `nama.toLowerCase() + ' ' + phone`. Nama sama dengan
  nomor beda tetap dua entitas — dua orang bisa bernama "Budi".
- **Barang** dikelompokkan per `nama.toLowerCase() + ' ' + unitPrice`. Harga berarti
  saran baru, bukan menimpa yang lama, supaya riwayat harga tidak hilang diam-diam.
- **Nama kosong dilewati.** Tidak ada yang bisa dilabeli.
- Tiap invoice men-de-duplicate barangnya sendiri, jadi "2x Nasi Goreng + 3x Nasi Goreng"
  di satu invoice tetap satu saran.
- **Recency menang.** Invoice diurutkan dari yang paling lama ke paling baru, jadi
  invoice terakhir selalu yang menentukan `lastUsedAt` dan `invoiceCount`.
- Tiap daftar dibatasi `PICKER_OPTION_LIMIT = 20`, terbaru di atas.

### Pemicu meninjau ulang keputusan ini

Kalau salah satu terpenuhi, tabel `customers`/`products` jadi layak:

1. Butuh pencarian lintas invoice yang lebih kaya dari substring pada label
   (misalnya filter per periode, atau urut berdasarkan nilai transaksi).
2. Butuh menyimpan data customer yang tidak ada di mana pun di invoice — email,
   alamat, catatan.
3. Butuh statistik bisnis (pelanggan teratas, barang terlaris) yang dihitung server-side.

Sampai itu terjadi, tabel tambahan murni biaya: migrasi, penulisan ganda, dan sumber
kebenaran kedua yang bisa menyimpang dari invoice.

## Alternatif yang ditolak

**Tabel `customers` + `products` terpisah.** Ditolak: menambah dua entitas, dua port,
dua infra adapter, dan konsistensi antara tabel dan embedded field invoice yang harus
dijaga manual. Untuk MVP yang tujuannya "bikin nota cepat", itu berlebihan.

**Menyimpan `customerId` di invoice.** Ditolak: berubah bentuk dokumen invoice yang sudah
ada, dan membuat invoice tidak lagi bisa dibaca mandiri.

**State lokal React saja tanpa riwayat.** Ditolak: kehilangan seluruh nilai picker —
alasannya ya supaya user tidak mengetik "Budi" yang keempat puluh kali.

## Konsekuensi

- Picker menampilkan **hanya** apa yang pernah dipakai di invoice yang tersimpan.
  Customer yang belum pernah bikin invoice tidak muncul. Itu diterima: picker adalah
  pelengkap, bukan satu-satunya cara mengisi form — field manual selalu tersedia.
- Saran datang dari `useInvoices('')`, sehingga mengikuti caching dan invalidasi query
  yang sama dengan halaman dashboard. Tidak ada lapisan state tambahan.
- `derivePickerOptions` murni dan tidak butuh DOM, jadi 14 test-nya berjalan di
  environment node.
