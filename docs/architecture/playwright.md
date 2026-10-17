# Playwright — keputusan: opsi B

- Status: **Accepted** — 2026-10-11
- Konsekuensi: `playwright.config.ts`, `e2e/probes.spec.ts`, `e2e/landing.spec.ts`, npm
  script `test:e2e`

## Keputusan

**Opsi B** — satu spec browser di `/probes`, tanpa jaringan, tanpa Appwrite.
Opsi C (E2E alur invoice penuh) ditunda sampai ada bukti regresi berulang di alur itu.

Alasan: `/probes` memakai adapter + kontrak + `register.ts` yang **identik** dengan
halaman invoice (`useCeProp`, `useCeEvent`, `contracts.ts`, tag `notain-*`). Yang
berbeda hanya sumber statenya: local, bukan TanStack Form. Dan wiring TanStack Form
itu React-only — sudah tercakup 131 test jsdom dan type-safety compile-time.

Menguji boundary di `/probes` berarti menguji boundary yang asli, bukan simulasi.

Opsi A (tidak pakai) ditolak karena menutup empat celah yang tidak bisa dicakup jsdom:

1. `connectedCallback` yang benar-benar async (Svelte 5 lewat microtask).
2. Event yang benar-benar menggelembung di browser sungguhan — kalau salah, event
   diam dan tidak ada test yang gagal.
3. Tailwind benar-benar menembus konten light DOM.
4. Ketiga framework hidup berdampingan di satu halaman, tanpa error console.

## Yang diadopsi

- `@playwright/test` `^1.64.0` (devDependency) + Chromium.
- `playwright.config.ts` — testDir `e2e/`, project Chromium saja, `baseURL`
  `http://localhost:4321`.
- `webServer.reuseExistingServer: true` — memakai dev server background yang sudah
  jalan (`astro dev --background`), jadi tidak ada server kedua. Kalau belum jalan,
  Playwright menyalakan `astro dev` sendiri.
- npm scripts: `test:e2e`, `test:e2e:ui`.
- `npm test` **tidak** menjalankan Playwright — tetap vitest + node/jsdom, cepat dan
  offline. Playwright terpisah supaya suite default tidak menambah waktu.
- `.gitignore`: `/test-results/`, `/playwright-report/`, `/blob-report/`,
  `/playwright/.cache/`.
- `/probes` **dipertahankan**, karena hampir gratis: chunk `probe-host` sendiri cuma
  2,7 KB — runtime Vue/Solid/Svelte sudah ikut terbundel oleh halaman invoice.
  Halaman itu juga jadi harness pemeriksaan manual.

## Delapan test

| Test                            | Membuktikan                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| register and mount              | `customElements.define` benar-benar jalan + `connectedCallback` async menyelesaikan render  |
| CustomEvents bubble             | Event dari elemen dalam menggelembung ke host yang didengar React                           |
| Tailwind styles island          | stylesheet global menembus light DOM; **0 island punya shadow root**                        |
| Svelte grid controlled by React | Klik "Tambah barang" → React menerima `itemschange` dan menyetir balik daftar lebih panjang |
| Solid inspector totals          | Nilai nyata dari `core/shared/money` (`Rp50.000`)                                           |
| Vue picker combobox             | Buka listbox, pilih opsi, `pick` mencapai state React                                       |
| Vue picker filter/empty         | Filter substring + pesan kosong                                                             |
| no console errors               | Tidak ada error dari island di console                                                      |

## Test tambahan: `e2e/landing.spec.ts`

Di luar opsi B, tapi alasannya sama jenis dengan temuan di bawah: **satu test, tanpa
jaringan, tanpa Appwrite.**

Landing page adalah satu-satunya halaman yang me-**SSR** island React (`client:load`),
sehingga halaman itu paling peka terhadap masalah modul. Test ini memuat `/`, memastikan
header + hero + zona rich-text tampil, lalu memeriksa dua hal: permintaan
`landing-app.tsx` berstatus 200, dan console bebas error.

Keduanya adalah sinyal langsung dari kegagalan yang paling sering terjadi — modul island
gagal dimuat dan hydrate mati diam-diam. Tanpa test ini, halaman tampak "sudah render"
(padahal itu hasil SSR) dan regresinya baru ketahuan saat ada orang membukanya.

## Temuan yang tercatat

**Vite dep-optimizer bisa basi.** Run pertama gagal 7/8 dengan `504 Outdated Optimize
Dep` — dev server sudah jalan ±6 jam dan dependency berubah. Solusinya `astro dev stop`
lalu start ulang. Kalau e2e tiba-tiba gagal semua dengan 504, itu penyebabnya. Kalau
restart saja tidak cukup (504-nya nyangkut di `dev-toolbar/entrypoint.js` walau sudah
restart berkali-kali), stop sekali lagi dengan **cache `.vite` dibiarkan utuh** — state
optimizer yang macet baru sembuh setelah start kedua; menghapus `node_modules/.vite`
tidak membantu dan hanya menambah waktu re-optimize.

**Astro dev toolbar punya shadow root.** Test "tanpa shadow root" sempat gagal karena
`astro-dev-toolbar` memakai shadow DOM. Asumsinya dikoreksi: yang dicek adalah elemen
`notain-*`, bukan seluruh halaman. Toolbar itu dev-only dan tidak ikut build produksi.

**`page.goto` tidak menunggu island.** `goto` menunggu event `load`, tapi script island
masih dimuat saat itu. `page.evaluate` yang mengecek `customElements.get` langsung
setelah `goto` akan race. Urutannya dibalik: assertion auto-retry dulu, evaluate
kemudian.

**Log `[data-probe-log]` tidak menerima event grid.** Log itu hanya terkabel ke tiga
island probe. Event `itemschange` grid diterima adapter `items-grid.tsx` sendiri, jadi
bukti React mendengarnya adalah jumlah `[data-item-row]` bertambah — bukan baris log.

## Biaya aktual

- Dependensi: `@playwright/test` ±3 paket npm; Chromium sudah ada di cache.
- Runtime: **5,9 detik** untuk 8 test, 4 worker.
- Penulisan: ±1 jam termasuk investigasi tiga kegagalan awal.

## Kalau nanti opsi C dibutuhkan

Pemicunya: regresi berulang di alur login → isi → simpan → PDF. Jangan dimulai sebelum
ada bukti regresinya.

Estimasi biaya saat itu:

- Seed data Appwrite (customer + beberapa invoice) sebelum tiap run, atau akun test
  khusus. Ini sumber flakiness utama.
- Kredensial Appwrite di environment test, atau mock server.
- Penulisan 1–2 hari kerja; runtime ±2–4 menit per run.
- Pemeliharaan paling mahal: setiap perubahan alur invoice memutus spec.
- Tab cetak (`openPrintView` → `window.open`) dan `window.open` WhatsApp butuh
  penanganan khusus (`page.on('popup')`, intercept navigasi). `/invoice/print?auto=1`
  memanggil `window.print()` sendiri, jadi spec harus mengunjunginya **tanpa** `?auto=1`
  supaya dialog cetak OS tidak muncul dan menggantung run.
