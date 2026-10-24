/**
 * Copy for the eight industry SEO pages (`/katering`, `/desainer`, …).
 *
 * These are marketing pages *about* Notain for one line of work — indexed,
 * in the sitemap, written around what people actually search ("aplikasi nota
 * katering", "invoice desain grafis"). They are a different animal from the
 * public business page at `/site/<ownerId>`, which stays `noindex`: that one
 * is a per-owner capability URL, these eight are our own landing pages.
 *
 * Pure data, no framework: `[slug].astro` maps it to routes and
 * `SeoIndustry.astro` renders it, so adding a ninth page is one entry here
 * plus its slug in `lib/seo.ts`'s INDEXABLE_ROUTES (checked by the test).
 *
 * Accuracy rules for entries in this file:
 * - every feature claim must exist in the product today (no API, no
 *   marketplace integrations, no stock reports we do not ship);
 * - prices quote `core/billing/plans.ts` (Pro Rp29.000 / Business Rp99.000
 *   per 30 hari) or link to `/pricing`;
 * - example invoice lines are illustrative and the section says so — they
 *   are not customer data.
 */

export type SeoIndustryFeature = { title: string; body: string };

export type SeoIndustryFaq = { question: string; answer: string };

export type SeoIndustryPage = {
  /** URL segment — `/slug/`. Also the route guard's allowlist key. */
  slug: string;
  /** Nav/chip label, exactly as people type the trade. */
  label: string;
  title: string;
  description: string;
  h1: string;
  heroLead: string;
  features: readonly SeoIndustryFeature[];
  /** Three numbered steps, trade-specific. */
  workflow: readonly string[];
  /** Illustrative nota lines for the demo block. */
  exampleLines: readonly string[];
  exampleNote: string;
  /** One paragraph: the trade's real pain, answered by the product. */
  pain: string;
  faq: readonly SeoIndustryFaq[];
};

export const INDUSTRY_PAGES: readonly SeoIndustryPage[] = [
  {
    slug: 'katering',
    label: 'Katering',
    title: 'Aplikasi Nota Katering & Invoice Catering | Notain',
    description:
      'Bikin invoice katering dalam hitungan detik: katalog paket, jumlah pesanan terhitung otomatis, PDF siap kirim ke klien via WhatsApp. Coba gratis.',
    h1: 'Nota katering rapi, siap sebelum pesanan berangkat',
    heroLead:
      'Susun nota catering dari daftar paket yang biasa kamu tawarkan, hitung totalnya otomatis, lalu kirim PDF-nya ke klien lewat WhatsApp.',
    features: [
      {
        title: 'Katalog paket & lauk',
        body: 'Simpan paket nasi box, prasmanan, atau satuan sekali saja; saat bikin nota tinggal pilih, jumlahnya ikut terisi.',
      },
      {
        title: 'Template sesuai usaha',
        body: 'Pilih tipe katering saat pertama kali, dan contoh notanya sudah tersusun untuk cara kerja katering.',
      },
      {
        title: 'Kirim ke klien',
        body: 'Unduh PDF-nya atau kirim langsung lewat WhatsApp lengkap dengan pesan yang sudah tersusun.',
      },
    ],
    workflow: [
      'Buka Notain, pilih tipe usaha katering — contoh notanya langsung sesuai bidangmu.',
      'Isi pesanan dari katalog: paket, lauk, jumlah pesanan.',
      'Kirim PDF ke klien lewat WhatsApp, tandai statusnya setelah dibayar.',
    ],
    exampleLines: [
      'Paket nasi box standar — 100 box — Rp35.000',
      'Paket prasmanan lengkap — 200 porsi — Rp45.000',
      'Ongkos kirim area kota — 1 — Rp150.000',
    ],
    exampleNote: 'Contoh susunan nota — sesuaikan dengan paketmu sendiri.',
    pain: 'Katering jarang order satu-satu: satu klien bisa punya beberapa paket, tambahan lauk, dan ongkos kirim yang berubah di menit-menit terakhir. Notain menjumlahkan semuanya otomatis, jadi tidak ada nota yang salah hitung.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai katering kecil?',
        answer:
          'Ya. Plan gratis mencakup pembuatan nota, katalog, dan kirim lewat WhatsApp. Link invoice dan laporan keuangan ada di plan Pro mulai Rp29.000 per 30 hari — detailnya di halaman Harga.',
      },
      {
        question: 'Bisakah paket dan harganya dicatat sekali saja?',
        answer:
          'Bisa. Semua paket disimpan di katalog; saat membuat nota tinggal pilih, nama, satuan, dan harganya terisi otomatis.',
      },
      {
        question: 'Bagaimana klien menerima notanya?',
        answer:
          'Unduh PDF lalu kirim lewat WhatsApp, atau bagikan link invoice-nya (fitur Pro) supaya klien bisa membuka notanya langsung dari HP.',
      },
      {
        question: 'Apakah total dan diskon dihitung otomatis?',
        answer:
          'Ya. Diskon, persentase pajak, dan total dihitung otomatis setiap baris ditambah atau diubah, termasuk pembulatan rupiah.',
      },
    ],
  },
  {
    slug: 'desainer',
    label: 'Desainer',
    title: 'Aplikasi Nota Desain Grafis & Freelance Designer | Notain',
    description:
      'Invoice desain grafis profesional dalam hitungan detik. Katalog jasa, tarif konsisten, dan kirim invoice ke klien via WhatsApp. Notain gratis untuk mulai.',
    h1: 'Invoice desain yang seprofesional karyanya',
    heroLead:
      'Klien desain menilai detail — termasuk notanya. Susun invoice dari daftar jasa dan tarifmu, lalu kirim PDF yang rapi dalam hitungan detik.',
    features: [
      {
        title: 'Katalog jasa & tarif',
        body: 'Logo, feed konten, brand guideline, desain kemasan — tarifnya tersimpan sekali dan dipakai konsisten di setiap invoice.',
      },
      {
        title: 'Nama proyek, bukan sekadar angka',
        body: 'Tulis nama klien dan proyek di setiap nota, sehingga riwayat kerja sama gampang ditelusuri saat ada revisi atau proyek lanjutan.',
      },
      {
        title: 'Halaman usaha untuk bio',
        body: 'Setiap akun punya halaman usaha publik yang menampilkan daftar jasa dan kontak — satu tautan untuk dipasang di bio Instagram.',
      },
    ],
    workflow: [
      'Daftar gratis dan pilih tipe usaha desain grafis.',
      'Masukkan jasa beserta tarifnya ke katalog.',
      'Buat invoice per proyek, kirim PDF atau linknya ke klien.',
    ],
    exampleLines: [
      'Desain logo +3 konsep — 1 proyek — Rp1.500.000',
      'Paket konten Instagram (12 post) — 1 bulan — Rp2.000.000',
      'Revisi tambahan di luar brif — 1 jam — Rp250.000',
    ],
    exampleNote: 'Contoh susunan invoice — ganti dengan tarif dan layananmu sendiri.',
    pain: 'Tarif desain sering berubah per klien dan per cakupan kerja, sehingga invoice mudah meleset atau terlalu lama ditulis. Dengan katalog, tarif ditetapkan sekali dan invoice berikutnya tinggal pilih baris.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk desainer freelance?',
        answer:
          'Ya. Plan gratis mencakup pembuatan invoice, katalog jasa, dan pengiriman via WhatsApp. Link invoice dan laporan ada di plan Pro mulai Rp29.000 per 30 hari.',
      },
      {
        question: 'Bisakah satu klien punya beberapa invoice?',
        answer:
          'Bisa. Setiap proyek atau tahap pembayaran dibuat sebagai invoice terpisah, dan semuanya tercatat atas nama klien yang sama di direktori pelanggan.',
      },
      {
        question: 'Bagaimana kalau klien telat membayar?',
        answer:
          'Invoice yang terkirim bisa dikirim ulang dengan pesan pengingat lewat WhatsApp dari dasbor, tanpa menulis ulang chat dari nol.',
      },
      {
        question: 'Apakah saya perlu install aplikasi?',
        answer:
          'Tidak. Notain jalan di browser HP maupun desktop, dan klien sama sekali tidak perlu akun untuk membuka serta mengunduh invoice-nya.',
      },
    ],
  },
  {
    slug: 'developer',
    label: 'Developer',
    title: 'Aplikasi Invoice Jasa Developer & Pembuatan Website | Notain',
    description:
      'Invoice untuk jasa pembuatan website, aplikasi, dan maintenance: rincian layanan dari katalog, status pembayaran terlacak, kirim ke klien via WhatsApp. Gratis.',
    h1: 'Invoice proyek software, tanpa spreadsheet',
    heroLead:
      'Rincian layanan, tahapan kerja, dan totalnya tersusun rapi di satu invoice — dari pembuatan website sampai maintenance bulanan.',
    features: [
      {
        title: 'Katalog layanan teknis',
        body: 'Pembuatan website, integrasi API, maintenance bulanan — beserta tarifnya, siap dipakai ulang di invoice berikutnya.',
      },
      {
        title: 'Invoice per tahap proyek',
        body: 'Pisahkan pembayaran per fase kerja; setiap invoice punya nomor, tanggal, dan statusnya sendiri sehingga tidak saling tertukar.',
      },
      {
        title: 'Riwayat klien otomatis',
        body: 'Nama klien tersimpan sendiri setiap kali dipakai, jadi invoice untuk klien yang sama tidak perlu diketik ulang datanya.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha software house / web developer.',
      'Masukkan layanan dan tarifnya ke katalog satu kali.',
      'Buat invoice per fase, kirim PDF atau link invoice ke klien.',
    ],
    exampleLines: [
      'Pembuatan landing page — 1 proyek — Rp4.500.000',
      'Integrasi pembayaran — 1 sesi — Rp2.000.000',
      'Maintenance bulanan — 1 bulan — Rp750.000',
    ],
    exampleNote: 'Contoh susunan invoice — sesuaikan dengan cakupan proyekmu.',
    pain: 'Jasa software dibayar bertahap dan sering berganti cakupan, sehingga tagihan mudah tertinggal di spreadsheet. Dengan invoice bernomor dan status yang jelas, tahap yang sudah dikerjakan selalu punya bukti tagihan sendiri.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai developer?',
        answer:
          'Ya. Plan gratis mencakup pembuatan invoice, katalog layanan, dan kirim via WhatsApp. Link invoice dan laporan keuangan ada di plan Pro mulai Rp29.000 per 30 hari.',
      },
      {
        question: 'Bisakah satu proyek punya beberapa invoice?',
        answer:
          'Bisa. Umumnya tiap tahap pembayaran dibuat invoice terpisah; semuanya tercatat atas nama klien yang sama dan bisa difilter dari daftar invoice.',
      },
      {
        question: 'Apakah klien bisa membuka invoice dari HP?',
        answer:
          'Bisa. Selain PDF, fitur Pro menghasilkan link invoice yang klien tinggal buka di browser — tanpa login dan tanpa instalasi apa pun.',
      },
      {
        question: 'Apakah datanya aman di awan?',
        answer:
          'Invoice disimpan di akun Notain dan hanya bisa dibuka olehmu, selain tautan invoice yang kamu kirimkan sendiri ke klien.',
      },
    ],
  },
  {
    slug: 'warung',
    label: 'Warung',
    title: 'Aplikasi Nota Warung, Kasir & Toko Kecil | Notain',
    description:
      'Bikin nota warung dengan cepat: menu tersimpan di katalog, total terhitung otomatis, unduh PDF atau kirim nota ke pembeli via WhatsApp. Gratis selamanya.',
    h1: 'Nota warung, dari kasir sampai WhatsApp',
    heroLead:
      'Pembeli warung butuh bukti belanja yang jelas, bukan coretan. Catat pesanan dari menu yang sudah tersimpan, notanya jadi dalam hitungan detik.',
    features: [
      {
        title: 'Menu tersimpan di katalog',
        body: 'Nasi pecel, es teh, gorengan — nama, satuan, dan harganya tinggal dipilih, tidak diketik ulang tiap pembeli datang.',
      },
      {
        title: 'Total selalu benar',
        body: 'Jumlah barang dikalikan dan dijumlahkan otomatis, jadi tidak ada salah catat di tengah antrean pembeli.',
      },
      {
        title: 'Bukti belanja yang rapi',
        body: 'Unduh PDF notanya atau kirim lewat WhatsApp — pembeli punya bukti, kamu punya riwayat penjualan.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha warung atau toko kelontong.',
      'Masukkan menu dan harga ke katalog sekali saja.',
      'Catat pesanan, kirim notanya, dan lihat rekap penjualan di dasbor.',
    ],
    exampleLines: [
      'Nasi pecel — 5 porsi — Rp10.000',
      'Es teh manis — 5 gelas — Rp3.000',
      'Rempeyek — 2 bungkus — Rp6.000',
    ],
    exampleNote: 'Contoh susunan nota — isi dengan menu warungmu sendiri.',
    pain: 'Nota buku cepat hilang dan sulit dicek ulang, sementara pembeli sering butuh bukti belanja untuk catatan pribadi atau penggantian. Satu catatan digital menggantikan buku nota tanpa mengubah cara warung bekerja.',
    faq: [
      {
        question: 'Apakah Notain benar-benar gratis untuk warung kecil?',
        answer:
          'Ya, plan gratis berlaku selamanya untuk pembuatan nota, katalog menu, dan kirim via WhatsApp. Plan Pro (Rp29.000 per 30 hari) menambahkan link invoice dan laporan keuangan.',
      },
      {
        question: 'Apakah harus punya komputer atau printer?',
        answer:
          'Tidak. Notain jalan di browser HP; notanya berupa PDF yang bisa dikirim lewat WhatsApp, dan dicetak hanya kalau memang diperlukan.',
      },
      {
        question: 'Bisakah mencatat pembeli langganan?',
        answer:
          'Bisa. Nama pembeli tersimpan sendiri di direktori pelanggan setiap kali dipakai, sehingga pembelian berikutnya tinggal dipilih.',
      },
      {
        question: 'Bagaimana kalau harga menu berubah?',
        answer:
          'Ubah harga di katalog; nota yang sudah dibuat tidak berubah — harga baru dipakai oleh nota berikutnya.',
      },
    ],
  },
  {
    slug: 'online-shop',
    label: 'Online shop',
    title: 'Aplikasi Invoice Online Shop & Penjualan Instagram | Notain',
    description:
      'Invoice untuk toko online: buat nota penjualan dari katalog produk, kirim ke pembeli via WhatsApp, lacak status pembayarannya. Notain gratis untuk mulai.',
    h1: 'Invoice toko online, rapi di setiap pesanan',
    heroLead:
      'Chat pesanan masuk, invoice keluar dalam hitungan detik. Daftar produk dan harganya sudah tersimpan, jadi tinggal pilih dan kirim.',
    features: [
      {
        title: 'Katalog produk siap pakai',
        body: 'Varian, jumlah, dan harga disimpan sekali; setiap pesanan tinggal pilih produknya dari daftar tanpa mengetik ulang.',
      },
      {
        title: 'Kirim via WhatsApp',
        body: 'PDF invoice langsung diteruskan ke pembeli lewat WhatsApp dengan pesan yang sudah tersusun — alur yang memang dipakai pembeli online.',
      },
      {
        title: 'Status pesanan terlacak',
        body: 'Invoice bertanda belum dikirim, terkirim, atau lunas, sehingga pesanan yang menunggu pembayaran tidak tercecer di antara chat.',
      },
    ],
    workflow: [
      'Daftar gratis dan pilih tipe usaha toko online / reseller.',
      'Masukkan produk beserta harga ke katalog.',
      'Buat invoice dari keranjang pesanan, lalu kirim ke pembeli.',
    ],
    exampleLines: [
      'Kaos polos katun combed — 3 pcs — Rp95.000',
      'Tote bag kanvas — 1 pcs — Rp120.000',
      'Ongkir kota bandung — 1 — Rp12.000',
    ],
    exampleNote: 'Contoh susunan invoice — isi dengan produk toko onlinemu.',
    pain: 'Pesanan datang dari banyak akun media sosial dalam bentuk chat, sehingga total dan status bayar mudah tertukar. Satu invoice per pesanan membuatnya jelas: apa yang dipesan, berapa totalnya, dan sudah dibayar atau belum.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk online shop kecil?',
        answer:
          'Ya, plan gratis berlaku selamanya untuk katalog produk, pembuatan invoice, dan kirim via WhatsApp. Link invoice dan laporan ada di plan Pro mulai Rp29.000 per 30 hari.',
      },
      {
        question: 'Bisakah invoice dikirim langsung dari HP?',
        answer:
          'Bisa. Notain dibuka di browser HP; setelah invoice jadi, tombol kirim membuka WhatsApp dengan pesan dan PDF yang sudah siap.',
      },
      {
        question: 'Bagaimana pembeli tahu invoice sudah dibayar?',
        answer:
          'Kamu memperbarui status invoice menjadi lunas; riwayatnya tercatat di daftar invoice dan terlihat di dasbor penjualan.',
      },
      {
        question: 'Apakah cocok untuk penjualan pre-order?',
        answer:
          'Cocok. Invoice dibuat saat pesanan masuk, dan statusnya tetap terpantau sampai pembayaran benar-benar diterima.',
      },
    ],
  },
  {
    slug: 'freelancer',
    label: 'Freelancer',
    title: 'Aplikasi Invoice Freelancer & Jasa Lepas | Notain',
    description:
      'Invoice freelancer profesional: katalog jasa dan tarif, invoice per proyek, pengingat pembayaran via WhatsApp. Pakai Notain gratis tanpa install.',
    h1: 'Invoice freelancer: profesional dalam hitungan detik',
    heroLead:
      'Kerja lepas berarti menjual jasa, bukan menagih. Notain mengubah daftar jasamu jadi invoice rapi yang siap dikirim ke klien.',
    features: [
      {
        title: 'Tarif jasa tersimpan',
        body: 'Simpan tarif per jenis pekerjaan; klien baru tidak perlu menanyakan harga dari nol dan invoice tidak salah ketik angka.',
      },
      {
        title: 'Pengingat pembayaran sekali klik',
        body: 'Dasbor menandai invoice yang belum dibayar dan mengirim ulang invoice beserta pesan pengingat lewat WhatsApp.',
      },
      {
        title: 'Halaman usaha untuk bio',
        body: 'Setiap akun punya halaman usaha publik berisi daftar jasa dan kontak — pas dipasang di bio media sosial atau signature email.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha sesuai bidangmu.',
      'Masukkan jasa dan tarif ke katalog.',
      'Buat invoice per proyek, kirim ke klien, tandai saat lunas.',
    ],
    exampleLines: [
      'Penulisan artikel (1.000 kata) — 4 artikel — Rp400.000',
      'Pengelolaan media sosial — 1 bulan — Rp2.500.000',
      'Konsultasi online — 2 sesi — Rp600.000',
    ],
    exampleNote: 'Contoh susunan invoice — ganti dengan jasa dan tarifmu.',
    pain: 'Menagih klien adalah bagian kerja yang paling sering ditunda freelancer. Dengan invoice dari katalog dan pengingat yang tinggal dikirim, penagihan berhenti jadi urusan yang canggung.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk freelancer?',
        answer:
          'Ya, plan gratis berlaku selamanya untuk katalog jasa, invoice, dan kirim via WhatsApp. Link invoice dan laporan keuangan tersedia di plan Pro mulai Rp29.000 per 30 hari.',
      },
      {
        question: 'Bagaimana kalau klien telat membayar?',
        answer:
          'Invoice yang terkirim bisa dikirim ulang dengan pesan pengingat dari dasbor, sehingga kamu tidak perlu menulis chat penagihan sendiri.',
      },
      {
        question: 'Apakah klien perlu akun untuk membuka invoice?',
        answer:
          'Tidak. Klien cukup membuka tautan atau PDF yang kamu kirim, langsung dari browser — tanpa registrasi apa pun.',
      },
      {
        question: 'Bisakah saya memantau semua proyek di satu tempat?',
        answer:
          'Bisa. Semua invoice tercatat di daftar invoice lengkap dengan statusnya, dan rekap pemasukannya terlihat di dasbor.',
      },
    ],
  },
  {
    slug: 'jasa-servis',
    label: 'Jasa servis',
    title: 'Aplikasi Nota Bengkel & Jasa Servis Kendaraan | Notain',
    description:
      'Nota bengkel dan jasa servis: catat unit, jenis pekerjaan, dan totalnya dalam hitungan detik. Simpan riwayat per pelanggan, kirim nota via WhatsApp. Gratis.',
    h1: 'Nota servis lengkap, dari nomor polisi sampai total',
    heroLead:
      'Servis yang tercatat rapi membuat pelanggan percaya: jenis pekerjaan, sparepart, dan totalnya tertulis jelas di satu nota bernomor.',
    features: [
      {
        title: 'Catatan per unit',
        body: 'Ruang rincian di tiap nota bisa diisi hal spesifik seperti nomor polisi, tipe unit, atau keluhan yang dilaporkan pelanggan.',
      },
      {
        title: 'Daftar pekerjaan & tarif',
        body: 'Ganti oli, servis rutin, cuci kendaraan — beserta harganya tersimpan di katalog sehingga tarif tidak berubah dari satu nota ke nota lain.',
      },
      {
        title: 'Riwayat per pelanggan',
        body: 'Nama pelanggan tersimpan sendiri setiap dipakai; riwayat servisnya bisa dilihat lagi saat unit yang sama datang kembali.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha bengkel atau jasa servis.',
      'Masukkan jenis pekerjaan dan tarifnya ke katalog.',
      'Catat unit yang diservis, kirim notanya, tandai setelah dibayar.',
    ],
    exampleLines: [
      'Ganti oli mesin — 1 unit — Rp150.000',
      'Servis rem depan — 1 unit — Rp350.000',
      'Cuci motor lengkap — 1 unit — Rp45.000',
    ],
    exampleNote: 'Contoh susunan nota — isi dengan pekerjaan bengkelmu.',
    pain: 'Pelanggan bengkel menanyakan “tadi diganti apa saja?” jauh setelah unit selesai. Nota digital dengan nama pelanggan dan rinciannya menjawab pertanyaan itu dalam hitungan detik, tanpa membolak-balik buku.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk bengkel kecil?',
        answer:
          'Ya, plan gratis berlaku selamanya untuk pembuatan nota, katalog pekerjaan, dan kirim via WhatsApp. Plan Pro (Rp29.000 per 30 hari) menambahkan link invoice dan laporan keuangan.',
      },
      {
        question: 'Bisakah mencatat nomor polisi atau tipe kendaraan?',
        answer:
          'Bisa. Tiap nota punya ruang rincian untuk data khusus seperti nomor polisi atau tipe unit, jadi riwayat per kendaraan mudah dicari.',
      },
      {
        question: 'Bagaimana pelanggan menerima notanya?',
        answer:
          'Unduh PDF lalu kirim lewat WhatsApp saat unit selesai diambil — pelanggan punya bukti rincian pekerjaan dan biayanya.',
      },
      {
        question: 'Apakah catatan servis lama masih bisa dilihat?',
        answer:
          'Bisa. Semua nota tersimpan di akunmu beserta nama pelanggannya; gunakan pencarian di daftar invoice untuk menemukan riwayatnya.',
      },
    ],
  },
  {
    slug: 'salon',
    label: 'Salon & barbershop',
    title: 'Aplikasi Nota Salon, Barbershop & Klinik Kecantikan | Notain',
    description:
      'Bikin nota salon dan barbershop dalam hitungan detik: daftar treatment tersimpan, total otomatis, kirim nota ke pelanggan via WhatsApp. Notain gratis.',
    h1: 'Nota salon yang semenarik layanannya',
    heroLead:
      'Antrean kursi tidak boleh menunggu pencatatan. Pilih treatment yang sudah tersimpan, notanya jadi sebelum pelanggan beranjak dari kursi.',
    features: [
      {
        title: 'Daftar treatment & tarif',
        body: 'Potong, creambath, facial, hair spa — semuanya tersimpan dengan harga yang sama di setiap nota, tanpa takut salah sebut.',
      },
      {
        title: 'Nota per kunjungan',
        body: 'Satu nota untuk satu kunjungan, lengkap dengan layanan yang diambil dan totalnya — mudah dijawab saat pelanggan menanyakan riwayat.',
      },
      {
        title: 'Nota via WhatsApp',
        body: 'Pelanggan menerima notanya lewat WhatsApp — tanpa aplikasi tambahan dan tanpa menunggu struk dicetak.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha salon atau barbershop.',
      'Masukkan treatment beserta harganya ke katalog.',
      'Catat layanan yang diambil, kirim notanya, dan lihat rekap harian di dasbor.',
    ],
    exampleLines: [
      'Potong rambut pria — 1 kali — Rp75.000',
      'Creambath — 1 kali — Rp65.000',
      'Hair spa — 1 kali — Rp150.000',
    ],
    exampleNote: 'Contoh susunan nota — isi dengan treatment salonmu.',
    pain: 'Layanan yang berlapis — paket, tambahan, promo bulanan — membuat total mudah salah hitung dan pelanggan ragu. Nota yang tertulis rapi membuat harga terasa transparan, dan transaksi tetap cepat di tengah antrean.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai salon kecil?',
        answer:
          'Ya, plan gratis berlaku selamanya untuk katalog treatment, pembuatan nota, dan kirim via WhatsApp. Plan Pro (Rp29.000 per 30 hari) menambahkan link invoice dan laporan keuangan.',
      },
      {
        question: 'Bisakah daftar harga dibagikan ke pelanggan?',
        answer:
          'Bisa. Selain nota, setiap akun punya halaman usaha publik yang menampilkan daftar layanan dan harganya — satu tautan untuk dibagikan.',
      },
      {
        question: 'Bagaimana kalau ada promo atau diskon?',
        answer:
          'Setiap nota bisa diberi diskon nominal atau persentase; totalnya dihitung otomatis dan tetap tercatat di riwayat penjualan.',
      },
      {
        question: 'Apakah bisa dipakai dari HP?',
        answer:
          'Bisa. Notain berjalan di browser HP maupun desktop, dan semua data tersimpan di akunmu sehingga bisa dibuka dari perangkat mana pun.',
      },
    ],
  },
];

/** Slugs in render order — `[slug].astro` maps these to routes. */
export const INDUSTRY_SLUGS: readonly string[] = INDUSTRY_PAGES.map((page) => page.slug);

/** One page by slug, or `undefined` for anything else (404 guards use this). */
export function getIndustryPage(slug: string | undefined): SeoIndustryPage | undefined {
  return INDUSTRY_PAGES.find((page) => page.slug === slug);
}
