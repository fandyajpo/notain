# Caching & rate limiting

Angka dan keputusan, bukan klaim. Dibaca bersama
[`adr/0006-single-query-layer.md`](adr/0006-single-query-layer.md).

## Konteks: aplikasi ini tidak punya server

`astro.config.mjs` tidak menyetel `output` maupun `adapter`, jadi Astro memakai
default **static**. Tidak ada `src/middleware.ts`, tidak ada endpoint di
`src/pages/` selain `.astro`, dan tidak ada Redis atau cache server di
`package.json`.

Semua request data berjalan **langsung dari browser ke Appwrite Cloud**
(`src/appwrite/client.ts` melempar error bila diakses di luar browser). Astro tidak
pernah melihat invoice, profile, maupun auth request.

Konsekuensinya:

| Mekanisme                                      | Bisa diterapkan di sini? | Kenapa                                                  |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| Cache klien (TanStack Query)                   | **Ya** — satu-satunya    | Satu-satunya lapisan yang memegang data                 |
| Header HTTP untuk aset statis                  | Ya, tapi host/CDN sudah  | Astro sudah me-fingerprint aset → immutable by default  |
| Rate limiting server untuk request ke Appwrite | **Tidak**                | Request tidak melewati aplikasi ini                     |
| Cache server untuk data publik                 | Tidak ada targetnya      | Tidak ada katalog/config publik; picker diturunkan dari |
|                                                |                          | invoice milik user sendiri (ADR 0003)                   |

Karena itu **tidak ada `src/middleware.ts`, tidak ada endpoint proxy, dan tidak ada
Redis**. Menambahkannya hanya akan melindungi lapisan yang tidak pernah menerima
request bermakna.

## Kebijakan cache per data

Sebelumnya semua query memakai satu `staleTime: 30s` global. Angka itu menjawab
pertanyaan yang salah untuk tiap jenis data. Sekarang kebijakannya ada di
`src/lib/query/policies.ts`, dan tiap hook memanggil `queryPolicy(...)`.

| Data               | `staleTime` | `gcTime` | Alasan                                                                                           |
| ------------------ | ----------- | -------- | ------------------------------------------------------------------------------------------------ |
| `session`          | ∞           | ∞        | Hanya berubah lewat event auth eksplisit; `AuthGate` bergantung padanya tidak pernah basi        |
| `profile`          | 5 menit     | 30 menit | Identitas usaha jarang berubah, aman dipakai lintas halaman                                      |
| `invoiceNumbers`   | 15 detik    | 5 menit  | Pengganti nomor berikutnya boleh tertinggal; saran kembar itu gangguan UX, bukan kehilangan data |
| `invoices` (list)  | 15 detik    | 5 menit  | Layar utama; sudah di-invalidate oleh mutasi, jadi jendela pendek cukup                          |
| `invoice` (detail) | 30 detik    | 5 menit  | Menyuplai dokumen untuk customer, jadi dipercaya sedikit lebih lama daripada list                |

`DEFAULT_QUERY_POLICY` adalah lantai untuk query yang tidak menyebut kebijakan.
Semua query di aplikasi ini menyebut salah satunya.

### Invalidation

Mutasi invoice memakai pola yang sudah ada dan tidak berubah:

- `useCreateInvoice` / `useUpdateInvoice` → `setQueryData` untuk entri tunggal, lalu
  invalidate `['invoices']` dan `invoiceNumbers`.
- `useDeleteInvoice` → optimistik: drop dari semua list via `setQueriesData`, hapus
  entri detail, rollback di `onError`, invalidate di `onSettled`.

### Retry

`shouldRetry` hanya mengulang kegagalan **transien** (`network`, `unknown` — biasanya
5xx), maksimal 2 kali dengan backoff eksponensial setengah-jitter (`retryDelay`).

Kegagalan deterministik **tidak pernah** diulang: `unauthenticated`, `forbidden`,
`not_found`, `validation`, `conflict`, dan `rate_limited`. Mengulang permintaan yang
sama hanya menambah beban Appwrite dan menunda error yang memang sudah pasti.

## Isolasi antar akun

Query key **tidak** dinamespasi per user id — `['invoices', search]` adalah key yang
sama untuk semua orang. Karena itu cache harus dikosongkan saat akun berganti,
bukan ditimpa.

`adoptSession` (`src/lib/query/session-cache.ts`) melakukan `queryClient.clear()`
lalu menulis ulang sesi. Ini dipanggil dari `useSignIn`, `useSignUp`, **dan**
`useSignOut`.

Sign-out sudah melakukan ini sejak awal. Yang ditambahkan adalah **sign-in**:
berganti akun bisa terjadi tanpa reload halaman, dan tanpa langkah itu invoice
milik akun sebelumnya akan terbaca oleh akun berikutnya.

Diverifikasi oleh `session-cache.test.ts` dengan `QueryClient` sungguhan.

## Rate limiting: batas yang jujur

**Pihak yang berwenang menegakkan rate limit atas data Notain adalah Appwrite,
bukan aplikasi ini.**

Endpoint dan project ID Appwrite sudah ada di bundle JS (`PUBLIC_APPWRITE_*`), jadi
siapa pun bisa memanggil Appwrite langsung dari console browser. Menambah proxy di
depan Appwrite **tidak mengamankan Appwrite** — hanya melindungi proxy itu sendiri.

### Yang dilakukan aplikasi

1. **Mengenali 429.** `mapStatusCode` memetakan status 429 ke
   `ERROR_CODES.RATE_LIMITED` berdasarkan **status**, bukan string `type` Appwrite,
   sehingga tipe rate-limit yang baru tidak pernah jatuh jadi `unknown`.

   > Sebelumnya 429 jatuh ke `unknown`, dan `shouldRetry` mengulangnya dua kali —
   > artinya klien menghantam Appwrite justru saat sedang dibatasi.

2. **Tidak pernah mengulang 429.** `isRateLimited` dipakai `shouldRetry` untuk
   berhenti. Mencoba ulang tidak membuat 429 lewat lebih cepat; ia hanya
   memperpanjang jendela throttle.

3. **Menghormati copy Appwrite.** Pesan `rate_limit` / `rate_limit_exceeded` dari
   Appwrite dipakai apa adanya, dengan fallback status-429 bila `type` tidak
   dikenali.

### Yang harus diatur di Appwrite Console

Kontrol berikut **tidak bisa** diberlakukan dari aplikasi statis ini:

- Limit login/registrasi per IP dan per akun — sudah ditangani Appwrite sendiri.
- Limit kuota database dan storage per proyek.
- Aturan permission per baris — sudah dipakai (`ownerRowPermissions`), dan tetap
  otoritatif terlepas dari cache.
- Limit upload file pada bucket `invoice-assets`.

Bila suatu saat butuh kuota yang lebih ketat per user, jalur yang benar adalah
**Appwrite Functions** (tetap di dalam Appwrite, tanpa server sendiri), bukan proxy.

### Yang tidak dilakukan, dan alasannya

| Tidak dilakukan                       | Alasan                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/middleware.ts` + rate limiter    | Tidak ada runtime server di produksi; middleware hanya melihat aset statis                    |
| Redis / store bersama                 | Tidak ada instance server yang bisa berbagi state; menambah dependensi tanpa pemakaian        |
| Proxy ke Appwrite                     | Tidak mengamankan Appwrite (endpoint-nya publik), dan butuh host non-statis + API key         |
| Rate limit di pembuatan PDF           | PDF dibuat **di browser** lewat `window.print()`; tidak ada operasi server yang bisa dibatasi |
| Client-side throttle sebagai keamanan | Bisa dilewati pelaku; dipakai hanya sebagai kesopanan, bukan kontrol                          |

## HTTP caching

Aset yang di-`build` sudah diberi fingerprint oleh Astro
(`invoice-builder.<hash>.js`), sehingga immutable by default — itu sudah benar dan
tidak perlu diubah.

Halaman HTML harus selalu segar (mengandung island dan session shell), dan
di-host sebagai `index.html` statis sehingga tidak ikut ter-cache panjang.

**Privasi:** respons invoice, profile, dan data auth tidak pernah melewati host
aplikasi ini, sehingga tidak berisiko masuk shared cache buatan sendiri. Proteksi
sesungguhnya ada di permission per-baris Appwrite.

## Cara memverifikasi

```bash
npm test          # policies, retry, isolasi akun, pemetaan 429
npm run build     # pastikan tidak ada peringatan chunk
```

Test terkait:

- `src/lib/query/policies.test.ts` — matriks retry, backoff, bentuk kebijakan
- `src/lib/query/session-cache.test.ts` — isolasi akun dengan `QueryClient` sungguhan
- `src/appwrite/errors.test.ts` — pemetaan status → kode error, termasuk 429
