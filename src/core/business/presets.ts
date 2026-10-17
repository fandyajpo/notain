/**
 * Per-category invoice presets: the prose, sample line items, unit hints and
 * block layout a new template starts from when the user picks a business type.
 *
 * One preset per *category* (19), not per subtype (175): a bengkel and a
 * dealership both want the same service-flavoured skeleton, and authoring
 * 175 near-identical sets would be noise. Subtypes inherit their category's
 * preset; a subtype override can be added later without touching the shape.
 *
 * Everything here is pure data plus a few factory functions — no framework,
 * no storage. Values are materialised into a template when it is created (see
 * the template editor) and used as sample-item sources when an invoice is
 * built, so this module never reaches into React or Appwrite.
 */

import { createBlock, createDefaultLayout, type TemplateBlock } from '../template/model';
import { BUSINESS_CATEGORIES, type BusinessCategorySlug } from './taxonomy';
import type { BusinessDetailField } from './detail-fields';

/**
 * A pre-filled line item for a fresh invoice. No `id`: callers mint ids the
 * same way they do for any other row (`createItemId`).
 */
export type BusinessSampleItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  /** Optional unit label, e.g. 'pcs', 'liter', 'sesi'. */
  unit?: string;
};

export type BusinessProse = {
  header: string;
  content: string;
  footer: string;
  notes?: string;
};

/** How many rows a "start me over" seed pre-fills into a new invoice. */
export const SAMPLE_ITEM_COUNT = 3;

function goodsLayout(): TemplateBlock[] {
  // Retail puts the table first: no opening prose block, notes tucked against
  // a narrower totals column so the page stays scannable.
  return [
    createBlock('letterhead', 'letterhead'),
    createBlock('customer', 'customer', 'left', 'wide'),
    createBlock('items', 'items'),
    createBlock('totals', 'totals', 'right', 'narrow'),
    createBlock('notes', 'notes', 'left', 'wide'),
    createBlock('richFooter', 'rich-footer', 'center'),
  ];
}

function serviceLayout(): TemplateBlock[] {
  // Jasa leads with an opening paragraph (the pitch) and a middle block for
  // the scope of work, which is where most service disputes start.
  return [
    createBlock('letterhead', 'letterhead'),
    createBlock('richHeader', 'rich-header'),
    createBlock('customer', 'customer', 'left', 'wide'),
    createBlock('items', 'items'),
    createBlock('richContent', 'rich-content'),
    createBlock('totals', 'totals', 'right'),
    createBlock('notes', 'notes'),
    createBlock('richFooter', 'rich-footer'),
  ];
}

function foodLayout(): TemplateBlock[] {
  // F&B is short and centred: a compact table, no middle prose, receipt-like.
  return [
    createBlock('letterhead', 'letterhead', 'center'),
    createBlock('customer', 'customer', 'center', 'narrow'),
    createBlock('items', 'items'),
    createBlock('totals', 'totals', 'right', 'narrow'),
    createBlock('richFooter', 'rich-footer', 'center'),
  ];
}

function professionalLayout(): TemplateBlock[] {
  // Formal engagements (consulting, health, construction) want a divider and
  // a notes well: enough structure for a document that gets filed.
  return [
    createBlock('letterhead', 'letterhead'),
    createBlock('richHeader', 'rich-header'),
    createBlock('customer', 'customer', 'left', 'wide'),
    createBlock('divider', 'divider'),
    createBlock('items', 'items'),
    createBlock('richContent', 'rich-content'),
    createBlock('totals', 'totals', 'right'),
    createBlock('notes', 'notes'),
    createBlock('richFooter', 'rich-footer'),
  ];
}

function generalLayout(): TemplateBlock[] {
  return createDefaultLayout();
}

export type BusinessPreset = {
  categorySlug: BusinessCategorySlug;
  /** Factory so every template gets its own block instances, never a shared array. */
  layout: () => TemplateBlock[];
  prose: BusinessProse;
  sampleItems: readonly BusinessSampleItem[];
  /** Unit labels offered as hints on the items grid, in priority order. */
  units: readonly string[];
  /**
   * Invoice-level detail fields this trade expects (see core/business/
   * detail-fields). A subtype whose needs diverge overrides these via
   * `DETAIL_FIELD_OVERRIDES`; an empty list means the shared columns already
   * cover the document.
   */
  detailFields: readonly BusinessDetailField[];
};

const presets: Record<BusinessCategorySlug, BusinessPreset> = {
  perdagangan: {
    categorySlug: 'perdagangan',
    layout: goodsLayout,
    prose: {
      header: '<p>Terima kasih sudah berbelanja di toko kami. Berikut rincian belanja kamu.</p>',
      content:
        '<p>Barang dapat ditukar selama 3 hari dengan nota dan kemasan masih utuh.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau QRIS saat barang diterima.</p>',
      notes: 'Barang pecah belah dicek dulu sebelum dikirim.',
    },
    sampleItems: [
      { name: 'Paket sembako hemat', quantity: 5, unitPrice: 250_000, unit: 'paket' },
      { name: 'Minyak goreng 2 liter', quantity: 12, unitPrice: 38_000, unit: 'pcs' },
      { name: 'Gula pasir 1 kilogram', quantity: 20, unitPrice: 17_000, unit: 'pcs' },
    ],
    units: ['pcs', 'unit', 'box', 'paket', 'lusin'],
    detailFields: [],
  },
  otomotif: {
    categorySlug: 'otomotif',
    layout: serviceLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan perawatan kendaraan kamu kepada kami. Berikut rincian pekerjaannya.</p>',
      content:
        '<p>Pekerjaan dikerjakan teknisi berpengalaman. Hubungi kami bila ada keluhan setelah servis.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai atau transfer setelah pekerjaan selesai.</p>',
      notes: 'Garansi jasa 30 hari. Suku cadang mengikuti ketentuan pemasok.',
    },
    sampleItems: [
      { name: 'Ganti oli mesin dan filter', quantity: 1, unitPrice: 350_000, unit: 'paket' },
      { name: 'Spooring dan balancing', quantity: 1, unitPrice: 150_000, unit: 'kali' },
      { name: 'Busi iridium', quantity: 4, unitPrice: 120_000, unit: 'pcs' },
    ],
    units: ['paket', 'pcs', 'unit', 'liter', 'jam'],
    detailFields: [
      { key: 'nama-kendaraan', label: 'Nama kendaraan', type: 'text' },
      { key: 'nomor-polisi', label: 'Nomor polisi', type: 'text' },
      { key: 'kilometer', label: 'Kilometer', type: 'number' },
    ],
  },
  'makanan-minuman': {
    categorySlug: 'makanan-minuman',
    layout: foodLayout,
    prose: {
      header: '<p>Terima kasih sudah pesan di kami. Berikut rincian pesanan kamu.</p>',
      content:
        '<p>Pesanan diproses maksimal 1×24 jam. Untuk pesanan besar, mohon pesan sehari sebelumnya.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau QRIS saat pesanan diterima.</p>',
      notes: 'Hubungi kami bila ada perubahan jumlah pesanan.',
    },
    sampleItems: [
      { name: 'Nasi goreng spesial', quantity: 3, unitPrice: 35_000, unit: 'porsi' },
      { name: 'Es teh manis', quantity: 4, unitPrice: 10_000, unit: 'gelas' },
      { name: 'Paket nasi kotak', quantity: 20, unitPrice: 28_000, unit: 'box' },
    ],
    units: ['porsi', 'pcs', 'box', 'gelas'],
    detailFields: [],
  },
  'fashion-tekstil': {
    categorySlug: 'fashion-tekstil',
    layout: goodsLayout,
    prose: {
      header: '<p>Terima kasih sudah berbelanja di toko kami. Berikut rincian pesanan kamu.</p>',
      content:
        '<p>Barang bisa ditukar ukuran selama 7 hari dengan nota dan label masih terpasang.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau QRIS.</p>',
      notes: 'Ukuran dan warna mengikuti ketersediaan stok.',
    },
    sampleItems: [
      { name: 'Kemeja batik lengan panjang', quantity: 2, unitPrice: 185_000, unit: 'pcs' },
      { name: 'Celana kain formal', quantity: 2, unitPrice: 220_000, unit: 'pcs' },
      { name: 'Kaos polos katun 30s', quantity: 5, unitPrice: 65_000, unit: 'pcs' },
    ],
    units: ['pcs', 'unit', 'lusin', 'meter'],
    detailFields: [],
  },
  jasa: {
    categorySlug: 'jasa',
    layout: serviceLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan pekerjaan ini kepada kami. Berikut rincian layanannya.</p>',
      content:
        '<p>Pekerjaan dianggap selesai setelah ada persetujuan hasil akhir dari klien.</p>',
      footer: '<p><strong>Pembayaran:</strong> termin 50% di muka dan 50% saat pekerjaan selesai.</p>',
      notes: 'Perubahan lingkup kerja dapat mengubah total biaya.',
    },
    sampleItems: [
      { name: 'Konsultasi awal', quantity: 2, unitPrice: 250_000, unit: 'jam' },
      { name: 'Penyusunan laporan analisis', quantity: 1, unitPrice: 2_500_000, unit: 'paket' },
      { name: 'Pendampingan implementasi', quantity: 3, unitPrice: 1_500_000, unit: 'hari' },
    ],
    units: ['jam', 'hari', 'sesi', 'paket'],
    detailFields: [{ key: 'lokasi-pekerjaan', label: 'Lokasi pekerjaan', type: 'text' }],
  },
  'teknologi-digital': {
    categorySlug: 'teknologi-digital',
    layout: professionalLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan pengembangan digital kamu kepada kami. Berikut rincian proyeknya.</p>',
      content: '<p>Masa dukung pasca-rilis 30 hari untuk perbaikan bug tanpa biaya tambahan.</p>',
      footer: '<p><strong>Pembayaran:</strong> termin sesuai kesepakatan proyek.</p>',
      notes: 'Akses akun dan aset diserahkan setelah pelunasan.',
    },
    sampleItems: [
      { name: 'Pengembangan landing page', quantity: 1, unitPrice: 4_500_000, unit: 'paket' },
      { name: 'Integrasi payment gateway', quantity: 1, unitPrice: 2_750_000, unit: 'paket' },
      { name: 'Maintenance dan hosting', quantity: 1, unitPrice: 450_000, unit: 'bulan' },
    ],
    units: ['paket', 'bulan', 'jam', 'lisensi'],
    detailFields: [
      { key: 'nama-proyek', label: 'Nama proyek', type: 'text' },
      { key: 'url-proyek', label: 'URL proyek', type: 'text' },
    ],
  },
  'kecantikan-perawatan': {
    categorySlug: 'kecantikan-perawatan',
    layout: serviceLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan perawatan kamu kepada kami. Berikut rincian layanannya.</p>',
      content: '<p>Konsultasi singkat sebelum treatment dilakukan tanpa biaya tambahan.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau QRIS setelah layanan.</p>',
      notes: 'Hasil perawatan bervariasi tergantung kondisi masing-masing.',
    },
    sampleItems: [
      { name: 'Creambath dan hair spa', quantity: 1, unitPrice: 120_000, unit: 'sesi' },
      { name: 'Potong dan styling rambut', quantity: 1, unitPrice: 85_000, unit: 'kali' },
      { name: 'Facial glow treatment', quantity: 1, unitPrice: 250_000, unit: 'sesi' },
    ],
    units: ['sesi', 'kali', 'pcs', 'bulan'],
    detailFields: [{ key: 'nama-stylist', label: 'Nama stylist/terapis', type: 'text' }],
  },
  'konstruksi-properti': {
    categorySlug: 'konstruksi-properti',
    layout: professionalLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan pekerjaan konstruksi kamu kepada kami. Berikut rincian proyeknya.</p>',
      content:
        '<p>Masa garansi pekerjaan 6 bulan untuk bagian yang dikerjakan langsung oleh tim kami.</p>',
      footer: '<p><strong>Pembayaran:</strong> termin berdasarkan progres pekerjaan.</p>',
      notes: 'Material di luar rincian ini dihitung terpisah bila ditambahkan.',
    },
    sampleItems: [
      { name: 'Renovasi kamar mandi', quantity: 1, unitPrice: 8_500_000, unit: 'paket' },
      { name: 'Pemasangan keramik lantai', quantity: 25, unitPrice: 145_000, unit: 'm2' },
      { name: 'Upah tukang harian', quantity: 5, unitPrice: 350_000, unit: 'hari' },
    ],
    units: ['paket', 'm2', 'hari', 'unit'],
    detailFields: [
      { key: 'lokasi-proyek', label: 'Lokasi proyek', type: 'text' },
      { key: 'nomor-spk', label: 'No. SPK', type: 'text' },
    ],
  },
  pendidikan: {
    categorySlug: 'pendidikan',
    layout: professionalLayout,
    prose: {
      header: '<p>Terima kasih sudah bergabung di program belajar kami. Berikut rincian biayanya.</p>',
      content: '<p>Materi dan akses kelas diberikan setelah pembayaran terverifikasi.</p>',
      footer: '<p><strong>Pembayaran:</strong> transfer di muka sebelum kelas dimulai.</p>',
      notes: 'Kelas yang terlewat dapat dijadwalkan ulang satu kali.',
    },
    sampleItems: [
      { name: 'Les privat matematika', quantity: 4, unitPrice: 175_000, unit: 'sesi' },
      { name: 'Kelas persiapan ujian', quantity: 1, unitPrice: 1_250_000, unit: 'paket' },
      { name: 'Akses modul digital', quantity: 1, unitPrice: 99_000, unit: 'bulan' },
    ],
    units: ['sesi', 'bulan', 'paket', 'jam'],
    detailFields: [
      { key: 'nama-siswa', label: 'Nama siswa/peserta', type: 'text' },
      { key: 'kelas', label: 'Kelas', type: 'text' },
    ],
  },
  kesehatan: {
    categorySlug: 'kesehatan',
    layout: professionalLayout,
    prose: {
      header: '<p>Terima kasih sudah menggunakan layanan kami. Berikut rincian pelayanannya.</p>',
      content: '<p>Mohon simpan nota ini untuk keperluan kontrol berikutnya.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau asuransi sesuai ketentuan.</p>',
      notes: 'Hubungi kami bila ada keluhan setelah pelayanan selesai.',
    },
    sampleItems: [
      { name: 'Konsultasi dokter umum', quantity: 1, unitPrice: 150_000, unit: 'kali' },
      { name: 'Cek darah lengkap', quantity: 1, unitPrice: 385_000, unit: 'paket' },
      { name: 'Terapi fisik', quantity: 4, unitPrice: 200_000, unit: 'sesi' },
    ],
    units: ['kali', 'sesi', 'paket', 'pcs'],
    detailFields: [
      { key: 'nama-pasien', label: 'Nama pasien', type: 'text' },
      { key: 'nomor-rm', label: 'No. rekam medis', type: 'text' },
    ],
  },
  'pariwisata-hospitality': {
    categorySlug: 'pariwisata-hospitality',
    layout: serviceLayout,
    prose: {
      header:
        '<p>Terima kasih sudah memilih layanan kami. Berikut rincian menginap dan fasilitasnya.</p>',
      content: '<p>Check-in mulai pukul 14.00, check-out maksimal pukul 12.00.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai, transfer, atau kartu saat check-out.</p>',
      notes: 'Pembatalan kurang dari 48 jam dikenakan biaya satu malam.',
    },
    sampleItems: [
      { name: 'Kamar deluxe', quantity: 2, unitPrice: 850_000, unit: 'malam' },
      { name: 'Sarapan prasmanan', quantity: 2, unitPrice: 125_000, unit: 'orang' },
      { name: 'Antar-jemput bandara', quantity: 1, unitPrice: 350_000, unit: 'paket' },
    ],
    units: ['malam', 'orang', 'hari', 'paket'],
    detailFields: [{ key: 'tanggal-layanan', label: 'Tanggal layanan', type: 'date' }],
  },
  'acara-hiburan': {
    categorySlug: 'acara-hiburan',
    layout: serviceLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan acaranya kepada kami. Berikut rincian layanannya.</p>',
      content: '<p>Rundown final dikunci paling lambat 7 hari sebelum acara berlangsung.</p>',
      footer: '<p><strong>Pembayaran:</strong> DP di muka, pelunasan paling lambat H-3 acara.</p>',
      notes: 'Biaya tambahan berlaku bila durasi acara melebihi kesepakatan.',
    },
    sampleItems: [
      { name: 'Dekorasi pelaminan', quantity: 1, unitPrice: 12_500_000, unit: 'paket' },
      { name: 'Dokumentasi foto dan video', quantity: 1, unitPrice: 4_500_000, unit: 'paket' },
      { name: 'Sewa tenda dan kursi', quantity: 1, unitPrice: 2_750_000, unit: 'hari' },
    ],
    units: ['paket', 'hari', 'orang', 'sesi'],
    detailFields: [
      { key: 'nama-acara', label: 'Nama acara', type: 'text' },
      { key: 'tanggal-acara', label: 'Tanggal acara', type: 'date' },
      { key: 'lokasi-acara', label: 'Lokasi acara', type: 'text' },
    ],
  },
  'manufaktur-produksi': {
    categorySlug: 'manufaktur-produksi',
    layout: goodsLayout,
    prose: {
      header: '<p>Terima kasih sudah memesan produksi di kami. Berikut rincian pesanannya.</p>',
      content: '<p>Masa produksi mengikuti jumlah pesanan dan ketersediaan bahan baku.</p>',
      footer: '<p><strong>Pembayaran:</strong> DP 50% saat pesanan masuk, sisanya saat pengiriman.</p>',
      notes: 'Desain kemasan final harus disetujui sebelum produksi massal.',
    },
    sampleItems: [
      { name: 'Keripik singkong kemasan 200 gram', quantity: 500, unitPrice: 8_500, unit: 'pcs' },
      { name: 'Gula rafinasi curah', quantity: 250, unitPrice: 15_500, unit: 'kg' },
      { name: 'Paket hampers produk UMKM', quantity: 40, unitPrice: 125_000, unit: 'paket' },
    ],
    units: ['pcs', 'unit', 'kg', 'box'],
    detailFields: [
      { key: 'nomor-po', label: 'No. PO', type: 'text' },
      { key: 'tanggal-pengiriman', label: 'Tanggal pengiriman', type: 'date' },
    ],
  },
  'pertanian-peternakan': {
    categorySlug: 'pertanian-peternakan',
    layout: goodsLayout,
    prose: {
      header: '<p>Terima kasih sudah membeli hasil panen kami. Berikut rincian pesanannya.</p>',
      content: '<p>Barang segar dikirim pada pagi hari agar kualitasnya terjaga.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai atau transfer saat barang diterima.</p>',
      notes: 'Berat bersih dapat berbeda maksimal 5% karena sifat alami barang.',
    },
    sampleItems: [
      { name: 'Ayam kampung siap potong', quantity: 50, unitPrice: 68_000, unit: 'kg' },
      { name: 'Telur ayam negeri', quantity: 10, unitPrice: 28_000, unit: 'kg' },
      { name: 'Pakan ayam 25 kilogram', quantity: 4, unitPrice: 320_000, unit: 'karung' },
    ],
    units: ['kg', 'ikat', 'liter', 'karung'],
    detailFields: [
      { key: 'tanggal-panen', label: 'Tanggal panen', type: 'date' },
      { key: 'kualitas', label: 'Kualitas', type: 'text' },
    ],
  },
  'logistik-transportasi': {
    categorySlug: 'logistik-transportasi',
    layout: goodsLayout,
    prose: {
      header:
        '<p>Terima kasih sudah menggunakan jasa pengiriman kami. Berikut rincian pengirimannya.</p>',
      content: '<p>Nomor resi dikirim setelah barang kami terima di gudang.</p>',
      footer: '<p><strong>Pembayaran:</strong> transfer di muka sebelum barang dikirim.</p>',
      notes: 'Asuransi pengiriman dapat ditambahkan atas permintaan.',
    },
    sampleItems: [
      { name: 'Kirim barang Jakarta ke Surabaya', quantity: 120, unitPrice: 9_500, unit: 'kg' },
      { name: 'Penjemputan barang', quantity: 1, unitPrice: 150_000, unit: 'kali' },
      { name: 'Packing kayu', quantity: 2, unitPrice: 275_000, unit: 'unit' },
    ],
    units: ['kg', 'koli', 'unit', 'truk'],
    detailFields: [
      { key: 'nomor-resi', label: 'No. resi', type: 'text' },
      { key: 'asal', label: 'Asal', type: 'text' },
      { key: 'tujuan', label: 'Tujuan', type: 'text' },
    ],
  },
  'keuangan-administrasi': {
    categorySlug: 'keuangan-administrasi',
    layout: professionalLayout,
    prose: {
      header:
        '<p>Terima kasih sudah menggunakan jasa pembukuan dan keuangan kami. Berikut rinciannya.</p>',
      content: '<p>Laporan dikirim melalui email setiap akhir periode.</p>',
      footer: '<p><strong>Pembayaran:</strong> transfer di awal periode layanan.</p>',
      notes: 'Data klien dijaga kerahasiaannya.',
    },
    sampleItems: [
      { name: 'Pembukuan bulanan UMKM', quantity: 1, unitPrice: 1_500_000, unit: 'bulan' },
      { name: 'Laporan keuangan tahunan', quantity: 1, unitPrice: 4_500_000, unit: 'paket' },
      { name: 'Konsultasi pajak', quantity: 2, unitPrice: 350_000, unit: 'jam' },
    ],
    units: ['bulan', 'paket', 'jam', 'laporan'],
    detailFields: [{ key: 'periode-layanan', label: 'Periode layanan', type: 'text' }],
  },
  'media-kreatif': {
    categorySlug: 'media-kreatif',
    layout: professionalLayout,
    prose: {
      header:
        '<p>Terima kasih sudah mempercayakan kebutuhan kreatif kamu kepada kami. Berikut rinciannya.</p>',
      content: '<p>Revisi desain maksimal 2 kali tanpa biaya tambahan.</p>',
      footer: '<p><strong>Pembayaran:</strong> DP 50% di muka, pelunasan saat file final diserahkan.</p>',
      notes: 'Hak penggunaan file diserahkan setelah pelunasan.',
    },
    sampleItems: [
      { name: 'Paket desain konten media sosial', quantity: 1, unitPrice: 1_850_000, unit: 'paket' },
      { name: 'Desain logo dan brand kit', quantity: 1, unitPrice: 2_500_000, unit: 'paket' },
      { name: 'Editing video per konten', quantity: 5, unitPrice: 250_000, unit: 'konten' },
    ],
    units: ['proyek', 'paket', 'jam', 'konten'],
    detailFields: [
      { key: 'nama-proyek', label: 'Nama proyek', type: 'text' },
      { key: 'tenggat', label: 'Tenggat', type: 'date' },
    ],
  },
  'energi-lingkungan': {
    categorySlug: 'energi-lingkungan',
    layout: professionalLayout,
    prose: {
      header: '<p>Terima kasih sudah menggunakan layanan kami. Berikut rincian pekerjaannya.</p>',
      content: '<p>Pekerjaan mengikuti standar keselamatan kerja yang berlaku.</p>',
      footer: '<p><strong>Pembayaran:</strong> termin sesuai kesepakatan pekerjaan.</p>',
      notes: 'Dokumen pelaporan diserahkan maksimal 7 hari setelah pekerjaan selesai.',
    },
    sampleItems: [
      { name: 'Servis instalasi listrik', quantity: 1, unitPrice: 850_000, unit: 'paket' },
      { name: 'Audit energi gedung', quantity: 1, unitPrice: 7_500_000, unit: 'paket' },
      { name: 'Sewa genset', quantity: 3, unitPrice: 1_850_000, unit: 'hari' },
    ],
    units: ['unit', 'kwh', 'paket', 'hari'],
    detailFields: [{ key: 'lokasi-pekerjaan', label: 'Lokasi pekerjaan', type: 'text' }],
  },
  'organisasi-lainnya': {
    categorySlug: 'organisasi-lainnya',
    layout: generalLayout,
    prose: {
      header: '<p>Terima kasih sudah menggunakan layanan kami. Berikut rincian biayanya.</p>',
      content: '<p>Dokumen pendukung dapat diminta melalui sekretariat kami.</p>',
      footer: '<p><strong>Pembayaran:</strong> tunai atau transfer ke rekening organisasi.</p>',
      notes: 'Kegiatan dijalankan sesuai anggaran yang disetujui.',
    },
    sampleItems: [
      { name: 'Sewa aula pertemuan', quantity: 1, unitPrice: 1_500_000, unit: 'hari' },
      { name: 'Konsumsi rapat', quantity: 30, unitPrice: 35_000, unit: 'porsi' },
      { name: 'Cetak laporan tahunan', quantity: 100, unitPrice: 15_000, unit: 'pcs' },
    ],
    units: ['paket', 'unit', 'bulan', 'porsi'],
    detailFields: [],
  },
};

export const BUSINESS_PRESETS = presets;

/** What an unknown or absent business type falls back to. */
export const GENERAL_PRESET = presets['organisasi-lainnya'];

/** Preset for a category slug, or the general preset when it is not known. */
export function getBusinessPresetForCategory(slug: string): BusinessPreset {
  return presets[slug as BusinessCategorySlug] ?? GENERAL_PRESET;
}

/**
 * Preset for a stored subtype slug. Unknown or empty slugs (legacy rows, a
 * renamed subtype) get the general preset rather than nothing, so seeding
 * still produces a usable template.
 */
export function getBusinessPreset(subtypeSlug: string | null | undefined): BusinessPreset {
  const category = BUSINESS_CATEGORIES.find((candidate) =>
    candidate.subtypes.some((subtype) => subtype.slug === subtypeSlug),
  );
  return category ? getBusinessPresetForCategory(category.slug) : GENERAL_PRESET;
}
