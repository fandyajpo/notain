# Halaman usaha publik — `/site/<ownerId>`

Halaman publik per-pemilik yang menampilkan profil usaha dan katalognya lewat satu
tautan capability URL. Tidak ada akun, tidak ada login: ID pemilik di path adalah
kredensialnya, persis seperti tautan `/invoice/print/<id>`.

## Alur request

```
GET /site/<ownerId>
  ├─ produksi : functions/site/[[id]].ts  → serveShell('/site/')
  └─ dev      : middleware di astro.config.mjs → rewrite ke shell '/site'
        ↓
src/pages/site.astro (shell statis) → <SiteApp client:only="react">
        ↓
GET /api/site/<ownerId>  (functions/api/site/[id].ts, tanpa sesi, API key server)
        ↓
src/app/public-site.ts (zod shape) → usePublicSite → site-app.tsx
        ↓
industryForSubtype(profile.businessType) → templates/<industri>.tsx (lazy chunk)
```

Kedua setengah route (function dan middleware) mengimpor pola segmen yang sama dari
`src/lib/edit-route.ts` (`ID_SEGMENT_PATTERN` + `siteIdFromLocation`), jadi apa yang
dianggap "id" tidak pernah berbeda antara produksi dan dev.

## Pemilihan template

Tidak ada preferensi baru untuk disimpan. Halaman membaca `profiles.businessType`
(subtipe dari taksonomi 175 entri, sudah diedit di settings) lalu memetakannya ke
industri di `src/core/site/industries.ts`:

| Industri | Subtipe representatif |
| --- | --- |
| `catering` | `katering` |
| `designer` | `desain-grafis`, `fotografi`, `periklanan`, … |
| `developer` | `web-development`, `software-development`, `it-services`, … |
| `warung` | `warung-makan`, `restoran`, `kafe`, `perdagangan-umum`, … |
| `online-shop` | `e-commerce`, `marketplace-seller`, `reseller`, … |
| `freelancer` | `freelancer`, `konsultan`, `jasa-profesional`, … |
| `repair` | `bengkel-motor`, `servis-elektronik`, `laundry`, … |
| `salon` | `salon`, `barbershop`, `klinik-kecantikan`, … |
| `general` | fallback: subtipe di luar delapan industri, atau belum memilih |

Subtipe yang tidak terdaftar sengaja jatuh ke `general` — kontraknya, bukan
kelalaian. Simpan tipe usaha di settings, halaman publik ikut; tidak ada UI pilihan
template terpisah.

## Kontrak privasi

Endpoint hanya boleh membawa field yang pemilik ketik ke profil untuk dipublikasikan:

- **Dikirim**: `businessName`, nama orang, telepon, alamat, email, slug tipe usaha,
  URL logo hasil render (`/api/logo/…`), dan katalog (nama, jenis, satuan, harga).
- **Tidak pernah dikirim**: `plan`, `planExpiresAt`, `logoFileId` (mentah), seluruh
  `ownerId` di row mana pun, timestamp baris.
- ID pemilik tetap terbaca di path — itu memang kredensial capability URL-nya, bukan
  field row.

Biaya dijaga dua lapis: daftar katalog dibatasi 100 baris (proyeksi kolom saja), dan
limit `site` (60/menit/IP, `QUOTA_LIMIT_SITE_PER_MINUTE`) di `_lib/quota.ts` — tiap
hit membaca 1 row profil + sampai 100 row katalog terhadap kuota Appwrite.

`/site/` tidak ada di `INDEXABLE_ROUTES` (`src/lib/seo.ts`), jadi halaman per-usaha
selalu `noindex` — halaman pelanggan bukan bagian dari sitemap Notain.

## Kesenjangan model data

Delapan industri diminta; yang tersedia di tabel `profiles` + `catalog` hari ini
hanyalah: nama usaha, nama orang, telepon, alamat, email, logo, tipe usaha, dan
katalog (nama/jenis/satuan/harga). Bagian landing yang datanya **belum ada**
ditampilkan hanya jika tersedia, dan tidak pernah diisi placeholder:

| Bagian yang diminta | Field sekarang | Perilaku halaman |
| --- | --- | --- |
| Deskripsi / tagline | tidak ada | tidak dirender; hero hanya memakai nama + label industri |
| Jam operasional | tidak ada | bagian jam disembunyikan di semua template |
| Media sosial | tidak ada | baris sosial disembunyikan |
| Galeri / portofolio | tidak ada (selain logo) | bagian galeri disembunyikan; logo jadi satu-satunya visual |
| Testimoni | tidak ada | tidak pernah dirender (aturan lama: tanpa data, tanpa testimoni) |
| Harga per item | `catalog.unitPrice` | `0` = "belum diisi" → tampil "Hubungi", bukan Rp0 |

### Perpanjangan terkecil yang diusulkan

Semua bisa ditambahkan sebagai kolom baru di tabel `profiles` yang sudah ada, lewat
pola `scripts/ensure-*.mjs` + whitelist `PUT /api/profile` yang sudah ada — **tanpa
tabel, layanan, atau dependensi baru**:

1. `sitePublished` (boolean, default `false`) — gerbang opt-in: `GET /api/site/<id>`
   menjawab 404 selama `false`. Ini satu-satunya perubahan perilaku yang berarti
   (halaman hari ini selalu "ada" selama `businessName` terisi, mengikuti model
   capability URL yang sama dengan invoice).
2. `siteBio` (teks, 300 char) — deskripsi/tagline.
3. `siteHours` (JSON, `{ "sen": "08:00-21:00", … }`) — jam operasional.
4. `siteSocials` (JSON, array `{ platform, url }`) — Instagram/TikTok/dll.
5. `siteGallery` (JSON, array key R2) — pakai bucket yang sama dengan logo.

Urutan yang masuk akal: `sitePublished` dulu (privasi), lalu `siteBio` (dampak
terbesar per huruf), lalu sisanya.

## Halaman SEO per industri (cluster terpisah)

Selain halaman per-pemilik, ada delapan halaman marketing yang **diindeks** —
`/katering`, `/desainer`, `/developer`, `/warung`, `/online-shop`,
`/freelancer`, `/jasa-servis`, `/salon`:

- Konten: `src/core/seo/industries.ts` (murni data), dirender satu file
  `src/pages/[slug].astro` — satu markup untuk delapan halaman, copy beda
  per industri, plus FAQPage JSON-LD yang menyalin FAQ yang terlihat.
- Indeksasi: tiap slug wajib ada di `INDEXABLE_ROUTES` (`src/lib/seo.ts`);
  aturan itu dijaga `src/core/seo/industries.test.ts`. Sitemap di-scaffold
  otomatis dari HTML (canonical + robots), jadi cluster ini muncul tanpa
  menyentuh `scripts/sitemap.mjs`.
- Kontras yang penting: delapan halaman ini `index, follow`, sedangkan
  `/site/<ownerId>` tetap `noindex` — yang satu halaman marketing, yang satu
  capability URL per-pemilik.

## Verifikasi

```sh
npm run typecheck   # astro check — 0 error
npm run lint
npm test -- tests/site-function.test.ts src/core/site/industries.test.ts src/components/react/site/site-templates.test.tsx src/lib/edit-route.test.ts
npm run build       # astro build + modulepreload + sitemap + csp-hashes
```

Test yang menutup fitur ini:

- `tests/site-function.test.ts` — payload publik, penyamaran field internal, 404,
  405, dan limit `site`.
- `src/core/site/industries.test.ts` — semua subtipe taksonomi mendarat di industri
  ber-label, tanpa subtipe diklaim dua kali, fallback `general` hidup.
- `src/components/react/site/site-templates.test.tsx` — kesembilan template render,
  palet berbeda per industri, dan profil minimal (nama saja) tidak menghasilkan
  tautan mati, `Rp0`, list kosong, atau teks `undefined`.
- `src/lib/edit-route.test.ts` — pembacaan id `/site/<ownerId>`.

Catatan lokal: `astro dev` hanya menyajikan situs statis, jadi `/api/site/*` baru
bisa dicoba sungguhan lewat `npm run dev:pages` (butuh `APPWRITE_API_KEY` di
`.dev.vars`); di test, endpoint-nya diuji lewat fake Appwrite.
