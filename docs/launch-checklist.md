# Checklist rilis produksi — Appwrite console

Langkah manual di Appwrite Console yang tidak bisa diotomasi dari kode. Lingkungan dev
sudah jalan; checklist ini untuk domain produksi.

Project: **Notain** — ID `6aca66fb003071c0ef43`, endpoint
`https://sgp.cloud.appwrite.io/v1` (region Singapore), database `notain_db`.

## Kenapa ini wajib

Alur lupa-password memanggil `createRecovery` dengan
`url = ${window.location.origin}/reset-password`
(lihat `src/infra/appwrite-auth-repository.ts:91-94`). Appwrite menolak request bila
origin tersebut **tidak terdaftar sebagai platform** — sudah dibuktikan: host palsu
balik `400`. Tanpa platform produksi terdaftar, tombol "Lupa password" di domain
produksi gagal sebelum email sempat dikirim.

## 1. Daftarkan platform Web (wajib)

- [ ] Buka Appwrite Console → project Notain (`6aca66fb003071c0ef43`)
- [ ] Sidebar project → **Apps → Add app** → **Choose platform: Web** → **App details**
      (langkah console saat ini; tombol "Add platform" lama sudah dipindah ke sini —
      lihat https://appwrite.io/docs/partners/project/platforms)
- [ ] Isi display name + **Hostname** persis domain produksi (contoh
      `notain.example.com`) — tanpa `https://`, tanpa path; tanpa port kecuali memang
      pakai port khusus
- [ ] Ulangi untuk setiap hostname alternatif yang bisa muncul di
      `window.location.origin` (mis. `www.…` bila ada redirect) — tiap origin = satu
      platform sendiri
- [ ] `localhost` sudah terdaftar (dev) — lingkungan lokal tidak perlu diubah

## 2. Email delivery (wajib untuk produksi)

Appwrite Cloud punya **shared SMTP bawaan yang aktif by default** untuk email akun
(recovery, verification, magic URL) — tanpa konfigurasi pun email bisa terkirim
(lihat https://appwrite.io/docs/partners/project/smtp).

- [ ] Pastikan alur recovery tetap memakai akun email sungguhan (default cukup untuk
      rilis awal)
- [ ] (Opsional, production-grade) **Settings → SMTP tab → Custom SMTP server** untuk
      kirim dari domain sendiri + deliverability SPF/DKIM — wajib bila ingin
      kustomisasi template (Auth → Templates butuh custom SMTP)
- [ ] Catatan: smoke test memakai akun placeholder `@example.com`
      (`smoke/appwrite.smoke.test.ts:14-23`), jadi pengiriman email **belum bisa
      diverifikasi end-to-end dari test suite** — wajib test manual dengan mailbox
      asli (langkah 3)

## 3. Verifikasi end-to-end (manual, sekali saat rilis)

- [ ] Siapkan satu akun dengan email asli (bukan placeholder smoke)
- [ ] Di domain produksi: Login → "Lupa password" → masukkan email tersebut
- [ ] Cek inbox **dan folder spam** — email reset harus masuk
- [ ] Klik link → halaman `/reset-password` terbuka (inilah yang divalidasi platform)
      → set password baru → login dengan password baru
- [ ] Pastikan masa berlaku link reset sesuai ekspektasi — default Appwrite **1 jam**
      (docs: "The verification link sent to the user's email address is valid for 1
      hour"); atur di Auth settings bila perlu

## 4. Sanity check berkala (opsional)

- [ ] Ganti/tambah domain atau subdomain → ulangi langkah 1 (origin baru = platform
      baru)
- [ ] Pastikan build produksi memakai `PUBLIC_APPWRITE_ENDPOINT` &
      `PUBLIC_APPWRITE_PROJECT_ID` yang cocok (default di `src/appwrite/config.ts`
      sudah benar untuk project ini)

## Sumber

Diverifikasi 2026-10-12 via docs.appwrite.io:

- Platform & console path: https://appwrite.io/docs/partners/project/platforms
- Shared SMTP default & custom SMTP: https://appwrite.io/docs/partners/project/smtp
- Recovery redirect wajib platform + expiry 1 jam:
  https://appwrite.io/docs/products/auth/email-password
- Template email butuh custom SMTP: https://appwrite.io/docs/products/auth/message-templates
