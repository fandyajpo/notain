# Pembayaran (DOKU Checkout)

Langganan Pro (Rp 29.000/30 hari) dan Business (Rp 99.000/30 hari) dibayar lewat
**DOKU Checkout** (hosted page, integrasi non-SNAP, **sandbox only** untuk saat
ini). Dokumen resmi: <https://developers.doku.com/accept-payments/doku-checkout/integration-guide>.

## Alur

1. Pengguna memilih plan di `/pricing` → CTA menuju `/checkout?plan=…` (plan
   bertahan lewat `?next=` saat harus login dulu).
2. `POST /api/payments/checkout` ([functions/api/payments/checkout.ts](../functions/api/payments/checkout.ts)):
   verifikasi sesi JWT → harga diambil dari katalog server
   (`src/core/billing/plans.ts`, bukan dari request) → baris `payments` dibuat
   (id = nomor invoice, unik) → order dibuat di DOKU → URL hosted page
   dikembalikan. Satu baris pending per pemilik+plan: klik ganda atau dua tab
   tidak membuat dua order (guard in-flight + 409).
3. Pembayaran terjadi di halaman DOKU; `auto_redirect` mengembalikan browser ke
   `/payment/result?invoice=…`, yang **hanya membaca** status via
   `GET /api/payments/status` (polling 3 detik hanya selama `pending`).
4. Aktivasi plan **hanya** terjadi di `POST /api/payments/doku-notify`
   ([functions/api/payments/doku-notify.ts](../functions/api/payments/doku-notify.ts)):
   signature diverifikasi atas byte mentah payload, jumlah cocok dengan baris,
   lalu `profiles.plan` + `planExpiresAt` diperpanjang (30 hari; perpanjangan
   plan aktif dihitung dari expiry, bukan waktu bayar). Notifikasi ulang dari
   DOKU aman: transisi diambil dari status baris saat ini (idempoten).
5. Riwayat + status langganan dibaca lewat `GET /api/payments/portal`
   (kartu **Langganan** di `/settings`); order `pending` yang masih berlaku
   punya tombol "Bayar" yang membuka kembali halaman DOKU.

Endpoint di sisi server:

| Route                       | Method | Otorisasi | Fungsi                          |
| --------------------------- | ------ | --------- | ------------------------------- |
| `/api/payments/checkout`    | POST   | JWT       | Mulai/lanjutkan checkout        |
| `/api/payments/status`      | GET    | JWT       | Status satu milik pembayaran    |
| `/api/payments/portal`      | GET    | JWT       | Plan + riwayat pembayaran       |
| `/api/payments/doku-notify` | POST   | Signature | Notifikasi DOKU (satu-satunya   |
|                             |        | DOKU      | jalan aktivasi plan)            |

## Environment variables

Ketiganya **rahasia server**, dipakai Pages Functions `functions/api/payments/*`
saja. Simpan sebagai **encrypted Pages variables** (dashboard → Settings →
Environment variables, atau `wrangler pages secret put NAME`) — **bukan** di
`.env` (hanya build Vite klien), **bukan** di `wrangler.toml` (ter-commit), dan
jangan pernah dengan prefix `PUBLIC_`:

| Nama                | Isi                                                                        |
| ------------------- | -------------------------------------------------------------------------- |
| `DOKU_CLIENT_ID`    | Client-Id merchant dari Back Office sandbox (format `MCH-…`).               |
| `DOKU_SECRET_KEY`   | Back Office Secret Key — menghitung dan memverifikasi signature `HMACSHA256=`. |
| `DOKU_API_KEY`      | Opsional untuk alur ini; dokumentasi Checkout non-SNAP hanya memakai dua di atas. |

Placeholder dan catatan lengkap: [`.env.example`](../.env.example).

## Callback & notification URL

Keduanya **diturunkan dari origin request** di Function (`new URL(request.url).origin`)
— tidak dikonfigurasi di env, jadi otomatis benar di preview maupun produksi:

- **Callback** (browser kembali dari DOKU): `{origin}/payment/result?invoice=…`
- **Notification** (server DOKU → server kita, via
  `additional_info.override_notification_url`): `{origin}/api/payments/doku-notify`

**Notification URL wajib disetel di Back Office sandbox**, karena
`override_notification_url` hanya *override* dari konfigurasi itu — menurut
dokumentasi resmi DOKU (<https://developers.doku.com/get-started-with-doku-api/notification/override-notification-url>),
override tidak berfungsi sama sekali bila Notification URL belum dikonfigurasi,
dan **path override harus sama persis dengan path yang terkonfigurasi**.
Jadi di Back Office isi:

```
https://notain.pages.dev/api/payments/doku-notify
```

Path-nya harus `/api/payments/doku-notify`; **domain-nya boleh berbeda**
(Back Office boleh memakai domain produksi, sementara request preview tetap
mengirim origin-nya sendiri) — yang tidak boleh beda adalah path. URL wajib
HTTPS dan terjangkau dari internet publik. Tanpa konfigurasi ini, notifikasi
`SUCCESS` tidak pernah sampai: baris pembayaran tetap `pending` dan plan tidak
pernah aktif meskipun checkout-nya sendiri berhasil.

Signature (non-SNAP, dihitung di `src/core/billing/doku.ts`): komponen
`Client-Id`, `Request-Id`, `Request-Timestamp` (UTC ISO 8601), `Request-Target`
(path endpoint / path notification URL kami), dan `Digest` (base64 SHA-256 dari
body mentah, POST saja) — satu per baris tanpa newline akhir, di-HMAC-SHA256
dengan Secret Key, di-base64, diawali literal `HMACSHA256=`.

## Menyiapkan & menguji di Sandbox

1. Buat akun sandbox di <https://sandbox.doku.com/> (Back Office) dan ambil
   Client-Id + Secret Key.
2. Buat tabel pembayaran di Appwrite (idempoten, aman dijalankan berulang):

   ```bash
   npm run payments:ensure              # dry-run: hanya menampilkan rencana
   npm run payments:ensure -- --yes     # eksekusi (butuh APPWRITE_API_KEY di .env)
   ```

3. Set tiga encrypted Pages variables (lihat tabel di atas), atau untuk `wrangler pages dev`:

   ```bash
   npx wrangler pages dev dist --binding DOKU_CLIENT_ID=… --binding DOKU_SECRET_KEY=…
   ```

4. Uji alurnya di sandbox (tidak ada uang sungguhan):

   | Skenario                       | Yang diharapkan                                          |
   | ------------------------------ | -------------------------------------------------------- |
   | Checkout sukses (VA sandbox)   | Notifikasi `SUCCESS` → plan aktif, `/payment/result` sukses |
   | Selesaikan nanti / batal       | Baris `pending`; tombol "Bayar" di `/settings` membuka lagi halaman DOKU sampai kedaluwarsa |
   | Order kedaluwarsa              | Notifikasi `EXPIRED` → baris `expired`, plan tidak berubah |
   | Signature salah / body diubah  | `401`, tidak ada baris yang ditulis                      |
   | Notifikasi ganda (retry DOKU)  | Aplikasi kedua dijawab `200` tapi `applied: false` — expiry tidak dobel |
   | Jumlah beda dengan baris       | Diabaikan + audit `payment.amount-mismatch`              |
   | Belum login / JWT kedaluwarsa  | `401` di semua endpoint pembayaran                       |

   Nomor invoice order berformat `NOTAIN-P-…` (Pro) / `NOTAIN-B-…` (Business) —
   bisa dicari di tabel `payments` untuk menemukan baris per uji coba.
   Signature notifikasi untuk uji manual bisa dihitung ulang dengan
   `signRequest()` dari `src/core/billing/doku.ts` (lihat pola di
   `tests/doku-notify.test.ts`).

5. Unit test (offline, memakai mock Appwrite + DOKU):

   ```bash
   npx vitest run tests/checkout.test.ts tests/doku-notify.test.ts tests/portal.test.ts src/core/billing
   ```

## Migrasi ke Production

Saat ini endpoint **dikunci ke sandbox** di
[`src/core/billing/doku.ts`](../src/core/billing/doku.ts)
(`DOKU_CHECKOUT_ENDPOINT = https://api-sandbox.doku.com/checkout/v1/payment`).
Sebelum menerima uang sungguhan:

1. Daftar merchant production di DOKU; dapatkan Client-Id + Secret Key
   **production** (Back Office production, bukan sandbox).
2. Ganti `DOKU_CHECKOUT_ENDPOINT` ke `https://api.doku.com/checkout/v1/payment`
   (satu konstanta; signature, payload, dan parsing respons sama persis —
   jalankan ulang unit test di atas). Evaluasi juga perubahan terkait:
   `PUBLIC_APPWRITE_DATABASE_ID`/origin produksi tidak perlu diubah karena
   sudah diturunkan dari request.
3. Ganti nilai ketiga Pages variables ke kredensial production
   (`wrangler pages secret put DOKU_CLIENT_ID` dll.) — rahasia sandbox dan
   production **tidak boleh** dipakai silang.
4. Uji ulang satu transaksi kecil end-to-end di produksi (webhook → aktivasi →
   riwayat di `/settings`), dan pastikan origin produksi muncul di
   notification URL (diturunkan otomatis).
5. Pantau audit log (`audit_logs`) untuk `payment.paid.activation-failed` —
   kasus di mana pembayaran tercatat `paid` tetapi aktivasi profil gagal
   (ditangani manual lewat admin panel).

Aturan keamanan yang berlaku, jangan dilanggar saat mengubah kode ini: harga
hanya dari katalog server; status plan hanya dari notifikasi terverifikasi
(halaman result tidak pernah mengaktivasi); baris `payments` ditulis dengan
`permissions: []` sehingga tidak terbaca dari browser SDK; dan kredensial DOKU
tidak pernah muncul di log, respons, atau kode frontend.
