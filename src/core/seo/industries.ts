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
 * - prices quote `core/billing/plans.ts` (Pro Rp49.000 / Business Rp99.000
 *   per 30 hari) or link to `/pricing`;
 * - example invoice lines are illustrative and the section says so — they
 *   are not customer data.
 */

import { PLAN_PRICES } from '../billing/plan-benefits';

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

const PRO_PRICE_PER_PERIOD = `${PLAN_PRICES.pro.amount} per 30 hari`;

export const INDUSTRY_PAGES: readonly SeoIndustryPage[] = [
  {
    slug: 'katering',
    label: 'Katering',
    title: 'Nota untuk usaha katering | Notain',
    description:
      'Buat nota katering dari daftar paket dan hitung total pesanan otomatis. Simpan PDF, buka WhatsApp, lampirkan berkas, lalu kirim sendiri. Mulai gratis.',
    h1: 'Nota katering rapi, siap sebelum pesanan berangkat',
    heroLead:
      'Pilih paket katering yang dipesan dan hitung totalnya otomatis. Simpan PDF, lalu lampirkan di WhatsApp untuk dikirim ke pelanggan.',
    features: [
      {
        title: 'Katalog paket & lauk',
        body: 'Simpan paket nasi box atau prasmanan di katalog. Saat membuat nota, pilih paket dan isi jumlahnya.',
      },
      {
        title: 'Template sesuai usaha',
        body: 'Pilih jenis usaha katering agar contoh template lebih cocok dengan pesananmu.',
      },
      {
        title: 'Bagikan ke pelanggan',
        body: 'Simpan PDF atau buka WhatsApp dengan pesan nota yang sudah disiapkan. Lampirkan PDF sendiri sebelum mengirim.',
      },
    ],
    workflow: [
      'Buka Notain dan pilih jenis usaha katering. Template contoh akan menyesuaikan.',
      'Isi pesanan dari katalog: paket, lauk, jumlah pesanan.',
      'Simpan PDF, lampirkan di WhatsApp, lalu kirim sendiri. Catat status nota setelah pembayaran diterima.',
    ],
    exampleLines: [
      'Paket nasi box standar, 100 box, Rp35.000',
      'Paket prasmanan lengkap, 200 porsi, Rp45.000',
      'Ongkos kirim dalam kota, 1 kali, Rp150.000',
    ],
    exampleNote: 'Ini contoh nota. Ganti dengan paket dan harga usahamu.',
    pain: 'Pesanan katering bisa berisi beberapa paket, lauk tambahan, dan ongkos kirim. Notain menghitung totalnya otomatis supaya kamu tidak perlu menjumlahkan satu per satu.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai katering kecil?',
        answer: `Ya. Free mencakup nota, katalog barang dan jasa, serta pesan WhatsApp yang bisa kamu siapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, termasuk tautan tagihan dan laporan usaha. Lihat rinciannya di halaman Harga.`,
      },
      {
        question: 'Bisakah paket dan harganya dicatat sekali saja?',
        answer:
          'Bisa. Semua paket disimpan di katalog; saat membuat nota tinggal pilih, nama, satuan, dan harganya terisi otomatis.',
      },
      {
        question: 'Bagaimana klien menerima notanya?',
        answer: `Simpan PDF, lampirkan di WhatsApp, lalu kirim sendiri. Dengan Pro, kamu juga bisa membagikan tautan tagihan agar pelanggan membukanya di HP.`,
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
    title: 'Nota untuk desainer dan pekerja lepas | Notain',
    description:
      'Buat nota untuk jasa desain dari daftar layanan dan tarifmu. Simpan PDF, lalu kirim sendiri lewat WhatsApp. Mulai gratis.',
    h1: 'Nota desain rapi, siap dikirim ke pelanggan',
    heroLead:
      'Pelanggan juga melihat kerapian nota. Pilih jasa dan tarif yang sudah tersimpan, lalu bagikan PDF-nya.',
    features: [
      {
        title: 'Katalog jasa & tarif',
        body: 'Simpan jasa seperti desain logo, konten media sosial, atau kemasan beserta tarifnya untuk dipakai lagi di nota berikutnya.',
      },
      {
        title: 'Nama proyek, bukan sekadar angka',
        body: 'Tulis nama klien dan proyek di setiap nota, sehingga riwayat kerja sama gampang ditelusuri saat ada revisi atau proyek lanjutan.',
      },
      {
        title: 'Halaman usaha untuk bio',
        body: 'Halaman usaha menampilkan daftar jasa dan kontak. Bagikan tautannya di bio Instagram.',
      },
    ],
    workflow: [
      'Daftar gratis dan pilih tipe usaha desain grafis.',
      'Masukkan jasa beserta tarifnya ke katalog.',
      'Buat tagihan per proyek, lalu kirim PDF atau tautannya ke pelanggan.',
    ],
    exampleLines: [
      'Desain logo, 3 konsep, Rp1.500.000',
      'Paket konten Instagram, 12 unggahan, Rp2.000.000',
      'Revisi tambahan di luar kesepakatan, 1 jam, Rp250.000',
    ],
    exampleNote: 'Ini contoh nota. Ganti dengan jasa dan tarifmu sendiri.',
    pain: 'Tarif desain bisa berbeda untuk tiap proyek. Simpan jasa dan tarif di katalog supaya kamu tidak perlu mengetik ulang setiap kali membuat invoice.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk desainer freelance?',
        answer: `Ya. Free mencakup pembuatan nota, katalog jasa, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD} dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bisakah satu klien punya beberapa invoice?',
        answer:
          'Bisa. Buat nota terpisah untuk tiap proyek atau tahap pembayaran. Semua nota tercatat atas nama pelanggan yang sama di daftar pelanggan.',
      },
      {
        question: 'Bagaimana kalau klien telat membayar?',
        answer:
          'Dari dasbor, siapkan pesan pengingat pembayaran di WhatsApp tanpa menulisnya dari awal. Lampirkan berkas jika perlu, lalu kirim sendiri.',
      },
      {
        question: 'Apakah saya perlu install aplikasi?',
        answer:
          'Tidak. Notain berjalan di browser HP maupun desktop. Pelanggan tidak perlu akun untuk membuka tautan tagihan atau PDF yang kamu bagikan.',
      },
    ],
  },
  {
    slug: 'developer',
    label: 'Developer',
    title: 'Invoice untuk jasa developer dan website | Notain',
    description:
      'Buat tagihan untuk jasa website, aplikasi, atau perawatan bulanan. Pilih layanan dari katalog, simpan PDF, lalu kirim sendiri lewat WhatsApp. Mulai gratis.',
    h1: 'Catat tagihan proyek software dengan rapi',
    heroLead:
      'Catat layanan dan biaya tiap tahap proyek dalam tagihan, dari pembuatan situs hingga perawatan bulanan.',
    features: [
      {
        title: 'Katalog layanan teknis',
        body: 'Simpan jasa pembuatan website, integrasi API, dan perawatan bulanan beserta tarifnya untuk dipakai lagi.',
      },
      {
        title: 'Tagihan per tahap proyek',
        body: 'Pisahkan pembayaran per fase kerja. Setiap tagihan punya nomor, tanggal, dan status sendiri agar tidak tertukar.',
      },
      {
        title: 'Riwayat pelanggan',
        body: 'Nama pelanggan tersimpan saat dipakai, jadi datanya tidak perlu diketik ulang untuk tagihan berikutnya.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha software house / web developer.',
      'Masukkan layanan dan tarifnya ke katalog satu kali.',
      'Buat tagihan per tahap, lalu bagikan PDF atau tautan tagihan ke pelanggan.',
    ],
    exampleLines: [
      'Pembuatan halaman promosi, 1 proyek, Rp4.500.000',
      'Integrasi pembayaran, 1 sesi, Rp2.000.000',
      'Perawatan bulanan, 1 bulan, Rp750.000',
    ],
    exampleNote: 'Ini contoh nota. Sesuaikan dengan pekerjaan dan tarifmu.',
    pain: 'Proyek software sering dibayar per tahap. Buat tagihan terpisah untuk tiap tahap agar status pembayarannya mudah dicek.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai developer?',
        answer: `Ya. Free mencakup pembuatan nota, katalog layanan, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD} dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bisakah satu proyek punya beberapa invoice?',
        answer:
          'Bisa. Buat nota terpisah untuk tiap tahap pembayaran. Semuanya tercatat atas nama pelanggan yang sama dan bisa dicari dari daftar nota.',
      },
      {
        question: 'Apakah klien bisa membuka invoice dari HP?',
        answer:
          'Bisa. Dengan Pro, kamu bisa membagikan tautan tagihan yang bisa dibuka pelanggan di browser tanpa akun.',
      },
      {
        question: 'Apakah datanya aman di awan?',
        answer:
          'Nota tersimpan di akun Notain. Pelanggan dapat melihat salinannya melalui tautan tagihan yang kamu bagikan.',
      },
    ],
  },
  {
    slug: 'warung',
    label: 'Warung',
    title: 'Nota untuk warung dan toko kecil | Notain',
    description:
      'Buat nota warung dari menu yang tersimpan di katalog. Total dihitung otomatis, lalu PDF bisa dibagikan lewat WhatsApp. Gratis untuk mulai.',
    h1: 'Nota warung, dari kasir sampai WhatsApp',
    heroLead:
      'Catat pesanan dari menu yang sudah tersimpan. Nota berisi rincian belanja dan total yang jelas untuk pembeli.',
    features: [
      {
        title: 'Menu tersimpan di katalog',
        body: 'Simpan nasi pecel, es teh, dan gorengan di katalog. Pilih saja saat membuat nota, tanpa mengetik ulang.',
      },
      {
        title: 'Total selalu benar',
        body: 'Jumlah barang dikalikan dan dijumlahkan otomatis, jadi tidak ada salah catat di tengah antrean pembeli.',
      },
      {
        title: 'Bukti belanja yang rapi',
        body: 'Simpan PDF, lalu lampirkan di WhatsApp dan kirim sendiri. Pembeli mendapat rincian belanja dan kamu menyimpan catatannya.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha warung atau toko kelontong.',
      'Masukkan menu dan harga ke katalog sekali saja.',
      'Catat pesanan, kirim notanya, dan lihat rekap penjualan di dasbor.',
    ],
    exampleLines: [
      'Nasi pecel, 5 porsi, Rp10.000',
      'Es teh manis, 5 gelas, Rp3.000',
      'Rempeyek, 2 bungkus, Rp6.000',
    ],
    exampleNote: 'Ini contoh nota. Isi dengan menu warungmu sendiri.',
    pain: 'Nota kertas mudah hilang dan sulit dicari lagi. Simpan salinan digital supaya kamu dan pembeli bisa melihat rincian belanja kapan saja.',
    faq: [
      {
        question: 'Apakah Notain benar-benar gratis untuk warung kecil?',
        answer: `Ya. Free mencakup nota, katalog menu, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, termasuk tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Apakah harus punya komputer atau printer?',
        answer:
          'Tidak. Notain berjalan di browser HP. Simpan nota sebagai PDF, lalu bagikan sendiri lewat WhatsApp atau cetak jika diperlukan.',
      },
      {
        question: 'Bisakah mencatat pembeli langganan?',
        answer:
          'Bisa. Nama pembeli tersimpan sendiri di direktori pelanggan setiap kali dipakai, sehingga pembelian berikutnya tinggal dipilih.',
      },
      {
        question: 'Bagaimana kalau harga menu berubah?',
        answer:
          'Ubah harga di katalog. Nota yang sudah dibuat tetap sama, dan harga baru dipakai di nota berikutnya.',
      },
    ],
  },
  {
    slug: 'online-shop',
    label: 'Online shop',
    title: 'Nota untuk toko online dan reseller | Notain',
    description:
      'Buat nota penjualan toko online dari katalog produk dan catat status pembayarannya. Simpan PDF, lalu bagikan sendiri lewat WhatsApp. Notain gratis untuk mulai.',
    h1: 'Nota toko online untuk tiap pesanan',
    heroLead:
      'Saat pesanan masuk, pilih produk dan harga yang sudah tersimpan. Buat nota lalu kirim ke pembeli.',
    features: [
      {
        title: 'Katalog produk siap pakai',
        body: 'Simpan nama produk, jumlah, dan harga di katalog. Saat ada pesanan, pilih produknya tanpa mengetik ulang.',
      },
      {
        title: 'Kirim via WhatsApp',
        body: 'Siapkan pesan WhatsApp tentang nota, simpan PDF, lalu lampirkan berkas dan kirim sendiri.',
      },
      {
        title: 'Status pesanan terlacak',
        body: 'Catat status nota sebagai terkirim, lunas, atau dibatalkan agar tagihan yang belum dibayar tidak terlewat.',
      },
    ],
    workflow: [
      'Daftar gratis dan pilih tipe usaha toko online / reseller.',
      'Masukkan produk beserta harga ke katalog.',
      'Buat nota untuk pesanan, lalu bagikan ke pembeli.',
    ],
    exampleLines: [
      'Kaos polos katun combed, 3 pcs, Rp95.000',
      'Tote bag kanvas, 1 pcs, Rp120.000',
      'Ongkir dalam kota, 1 kali, Rp12.000',
    ],
    exampleNote: 'Ini contoh nota. Ganti dengan produk toko onlinemu.',
    pain: 'Pesanan dari berbagai chat mudah tertukar. Buat satu nota untuk tiap pesanan agar barang, total, dan status pembayaran lebih mudah dicek.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk online shop kecil?',
        answer: `Ya, Free berlaku selamanya untuk katalog produk, pembuatan nota, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bisakah invoice dikirim langsung dari HP?',
        answer:
          'Bisa. Buka Notain di browser HP. Setelah nota jadi, simpan PDF, buka WhatsApp, lampirkan berkas, lalu kirim sendiri.',
      },
      {
        question: 'Bagaimana pembeli tahu invoice sudah dibayar?',
        answer:
          'Setelah pembayaran diterima, catat status nota sebagai Lunas. Statusnya terlihat di daftar nota dan dasbor.',
      },
      {
        question: 'Apakah cocok untuk penjualan pre-order?',
        answer:
          'Cocok. Buat nota saat pesanan masuk, lalu catat statusnya setelah menerima pembayaran.',
      },
    ],
  },
  {
    slug: 'freelancer',
    label: 'Freelancer',
    title: 'Aplikasi Invoice Freelancer & Jasa Lepas | Notain',
    description:
      'Buat nota freelancer dari katalog jasa dan tarif, lalu catat tagihan per proyek. Siapkan pengingat pembayaran di WhatsApp. Pakai Notain gratis tanpa instalasi.',
    h1: 'Invoice freelancer: profesional dalam hitungan detik',
    heroLead:
      'Kerja lepas berarti menjual jasa, bukan menagih. Notain mengubah daftar jasamu jadi invoice rapi yang siap dikirim ke klien.',
    features: [
      {
        title: 'Tarif jasa tersimpan',
        body: 'Simpan tarif per jenis pekerjaan; klien baru tidak perlu menanyakan harga dari nol dan invoice tidak salah ketik angka.',
      },
      {
        title: 'Pengingat pembayaran mudah disiapkan',
        body: 'Dasbor menampilkan tagihan yang belum lunas. Siapkan pesan pengingat di WhatsApp, lalu kirim sendiri setelah memeriksa isinya.',
      },
      {
        title: 'Halaman usaha untuk bio',
        body: 'Halaman usaha berisi daftar jasa dan kontak. Bagikan tautannya di media sosial atau email.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha sesuai bidangmu.',
      'Masukkan jasa dan tarif ke katalog.',
      'Buat tagihan per proyek, bagikan ke pelanggan, lalu catat pembayaran saat diterima.',
    ],
    exampleLines: [
      'Penulisan artikel, 1.000 kata, 4 artikel, Rp400.000',
      'Pengelolaan media sosial, 1 bulan, Rp2.500.000',
      'Konsultasi online, 2 sesi, Rp600.000',
    ],
    exampleNote: 'Ini contoh nota. Ganti dengan jasa dan tarifmu.',
    pain: 'Menagih klien adalah bagian kerja yang paling sering ditunda freelancer. Dengan invoice dari katalog dan pengingat yang tinggal dikirim, penagihan berhenti jadi urusan yang canggung.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk freelancer?',
        answer: `Ya, Free berlaku selamanya untuk katalog jasa, nota, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bagaimana kalau klien telat membayar?',
        answer:
          'Dari dasbor, siapkan pesan pengingat pembayaran di WhatsApp. Periksa pesannya dan kirim sendiri ke pelanggan.',
      },
      {
        question: 'Apakah klien perlu akun untuk membuka invoice?',
        answer:
          'Tidak. Pelanggan bisa membuka tautan tagihan atau PDF yang kamu bagikan di browser tanpa membuat akun.',
      },
      {
        question: 'Bisakah saya memantau semua proyek di satu tempat?',
        answer:
          'Bisa. Semua nota tercatat di daftar nota beserta statusnya. Ringkasan pemasukan tersedia di dasbor.',
      },
    ],
  },
  {
    slug: 'jasa-servis',
    label: 'Jasa servis',
    title: 'Nota untuk bengkel dan jasa servis | Notain',
    description:
      'Nota bengkel dan jasa servis: catat unit, jenis pekerjaan, dan totalnya dalam hitungan detik. Simpan riwayat per pelanggan, kirim nota via WhatsApp. Gratis.',
    h1: 'Nota servis lengkap, dari nomor polisi sampai total',
    heroLead:
      'Catat pekerjaan, suku cadang, dan total biaya di satu nota supaya pelanggan tahu apa saja yang dikerjakan.',
    features: [
      {
        title: 'Catatan per unit',
        body: 'Ruang rincian di tiap nota bisa diisi hal spesifik seperti nomor polisi, tipe unit, atau keluhan yang dilaporkan pelanggan.',
      },
      {
        title: 'Daftar pekerjaan & tarif',
        body: 'Simpan harga ganti oli, servis rutin, dan cuci kendaraan di katalog agar mudah dipakai lagi.',
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
      'Ganti oli mesin, 1 unit, Rp150.000',
      'Servis rem depan, 1 unit, Rp350.000',
      'Cuci motor lengkap, 1 unit, Rp45.000',
    ],
    exampleNote: 'Ini contoh nota. Isi dengan pekerjaan bengkelmu.',
    pain: 'Pelanggan bisa melihat lagi pekerjaan dan suku cadang yang tercatat di nota, tanpa kamu perlu mencari-cari di buku.',
    faq: [
      {
        question: 'Apakah Notain gratis untuk bengkel kecil?',
        answer: `Ya, Free berlaku selamanya untuk pembuatan nota, katalog pekerjaan, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bisakah mencatat nomor polisi atau tipe kendaraan?',
        answer:
          'Bisa. Tiap nota punya ruang rincian untuk data khusus seperti nomor polisi atau tipe unit, jadi riwayat per kendaraan mudah dicari.',
      },
      {
        question: 'Bagaimana pelanggan menerima notanya?',
        answer:
          'Simpan PDF, lampirkan di WhatsApp, lalu kirim sendiri setelah kendaraan selesai. Pelanggan mendapat rincian pekerjaan dan biayanya.',
      },
      {
        question: 'Apakah catatan servis lama masih bisa dilihat?',
        answer:
          'Bisa. Nota tersimpan di akunmu beserta nama pelanggan. Cari nota dari daftar untuk melihat riwayatnya.',
      },
    ],
  },
  {
    slug: 'salon',
    label: 'Salon & barbershop',
    title: 'Nota untuk salon dan barbershop | Notain',
    description:
      'Buat nota salon dari daftar layanan yang tersimpan, hitung total otomatis, lalu kirim lewat WhatsApp. Mulai gratis.',
    h1: 'Buat nota salon dengan cepat dan rapi',
    heroLead:
      'Pilih layanan salon yang sudah tersimpan, catat totalnya, lalu bagikan nota sebelum pelanggan pulang.',
    features: [
      {
        title: 'Daftar treatment & tarif',
        body: 'Simpan layanan seperti potong rambut, creambath, dan facial beserta harganya untuk dipakai lagi.',
      },
      {
        title: 'Nota per kunjungan',
        body: 'Buat satu nota untuk tiap kunjungan, lengkap dengan layanan dan jumlah yang harus dibayar.',
      },
      {
        title: 'Nota via WhatsApp',
        body: 'Kirim nota lewat WhatsApp. Pelanggan tidak perlu aplikasi tambahan atau menunggu struk dicetak.',
      },
    ],
    workflow: [
      'Daftar gratis, pilih tipe usaha salon atau barbershop.',
      'Masukkan treatment beserta harganya ke katalog.',
      'Catat layanan yang diambil, kirim notanya, dan lihat rekap harian di dasbor.',
    ],
    exampleLines: [
      'Potong rambut pria, 1 kali, Rp75.000',
      'Creambath, 1 kali, Rp65.000',
      'Hair spa, 1 kali, Rp150.000',
    ],
    exampleNote: 'Ini contoh nota. Ganti dengan layanan salonmu.',
    pain: 'Paket, layanan tambahan, dan promo bisa membuat total belanja sulit dihitung. Nota dengan rincian jelas membantu pelanggan paham biaya yang dibayar.',
    faq: [
      {
        question: 'Apakah Notain gratis dipakai salon kecil?',
        answer: `Ya, Free berlaku selamanya untuk katalog layanan, pembuatan nota, dan pesan WhatsApp yang bisa disiapkan. Pro mulai ${PRO_PRICE_PER_PERIOD}, dengan tautan tagihan dan laporan usaha.`,
      },
      {
        question: 'Bisakah daftar harga dibagikan ke pelanggan?',
        answer:
          'Bisa. Halaman usahamu bisa menampilkan daftar layanan dan harganya. Bagikan tautannya ke pelanggan.',
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
