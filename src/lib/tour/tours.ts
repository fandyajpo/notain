/**
 * Driver.js tour definitions.
 *
 * Each step points at a stable `data-tour="…"` attribute rather than a fragile
 * class or DOM path, so copy changes and layout tweaks don't silently break a
 * tour. Steps are short and task-oriented. Copy is Indonesian to match the app.
 */

export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
  /** Value of the `data-tour` attribute to highlight. */
  target: string;
  title: string;
  description: string;
  side?: TourSide;
  /** Don't let the user click through to the highlighted control (read-only steps). */
  blockInteraction?: boolean;
};

export type TourDef = {
  id: string;
  steps: TourStep[];
};

export const TOURS: Record<string, TourDef> = {
  /** Initial onboarding, shown once right after the profile is completed. */
  welcome: {
    id: 'welcome',
    steps: [
      {
        target: 'dash-hero',
        title: 'Selamat datang di Notain 👋',
        description:
          'Notain bantu kamu bikin, kirim, dan melacak invoice dalam hitungan detik. Ini tur singkat supaya kamu cepat mulai.',
        side: 'bottom',
      },
      {
        target: 'dash-summary',
        title: 'Ringkasan usaha kamu',
        description:
          'Jumlah invoice dan pelanggan tampil di sini, selalu terbaru. Semua otomatis terhitung.',
        side: 'top',
      },
      {
        target: 'dash-create',
        title: 'Bikin invoice baru',
        description:
          'Ketuk tombol ini kapan saja. Isi data pelanggan dan item, lalu totalnya dihitung otomatis: diskon, pajak, pembulatan.',
        side: 'bottom',
      },
      {
        target: 'dash-recent',
        title: 'Kelola & bagikan invoice',
        description:
          'Invoice terbaru ada di sini. Buka satu untuk melihat detail, unduh PDF A4, atau kirim langsung ke WhatsApp pelanggan. Selamat berkarya!',
        side: 'top',
      },
    ],
  },

  /** Per-menu tour for the invoice list. */
  invoices: {
    id: 'invoices',
    steps: [
      {
        target: 'invoices-create',
        title: 'Buat invoice di sini',
        description: 'Mulai dari tombol ini untuk membuat invoice baru.',
        side: 'bottom',
      },
      {
        target: 'invoices-search',
        title: 'Cari cepat',
        description: 'Cari berdasarkan nomor nota, nama pelanggan, atau barang.',
        side: 'bottom',
      },
      {
        target: 'invoices-filter',
        title: 'Saring daftar invoice',
        description:
          'Pilih status (Terkirim, Lunas, Batal) atau template untuk menyaring daftar. Ketuk × pada salah satunya untuk menghapus saringan.',
        side: 'bottom',
      },
      {
        target: 'invoices-table',
        title: 'Daftar invoice kamu',
        description:
          'Setiap baris menampilkan nomor nota, pelanggan, tanggal, total, dan status. Buka nota untuk melihat rinciannya, mengubah status, mengunduh PDF, atau membagikannya lewat WhatsApp.',
        side: 'top',
      },
    ],
  },

  /** Per-menu tour for the invoice editor. */
  'invoice-create': {
    id: 'invoice-create',
    steps: [
      {
        target: 'inv-tabs',
        title: 'Isi lewat tab',
        description:
          'Isi nota lewat beberapa tab, seperti Pelanggan, Barang, dan Tampilan. Pindah tab untuk melengkapi tiap bagian.',
        side: 'bottom',
      },
      {
        target: 'inv-totals',
        title: 'Diskon, pajak & total',
        description:
          'Atur diskon dan pajak di sini. Subtotal dan Grand Total selalu akurat, tanpa hitung manual.',
        side: 'top',
      },
      {
        target: 'inv-preview',
        title: 'Pratinjau & simpan',
        description:
          'Pratinjau nota di samping ikut berubah saat kamu mengisi. Kalau sudah siap, simpan notanya.',
        side: 'left',
      },
    ],
  },

  /** Per-menu tour for pelanggan. */
  pelanggan: {
    id: 'pelanggan',
    steps: [
      {
        target: 'cust-form',
        title: 'Tambah pelanggan',
        description:
          'Simpan nama, email, dan nomor WhatsApp supaya bisa dipakai lagi saat membuat nota.',
        side: 'bottom',
      },
      {
        target: 'cust-list',
        title: 'Daftar pelanggan kamu',
        description:
          'Semua pelanggan tercatat di sini. Cari, ubah datanya, atau gabungkan duplikat supaya daftar tetap rapi.',
        side: 'top',
      },
    ],
  },

  /** Per-menu tour for the catalog. */
  catalog: {
    id: 'catalog',
    steps: [
      {
        target: 'catalog-form',
        title: 'Simpan barang & jasa',
        description:
          'Simpan nama barang atau jasa, satuan, dan harganya. Pilih lagi saat membuat nota.',
        side: 'bottom',
      },
      {
        target: 'catalog-list',
        title: 'Katalog kamu',
        description:
          'Semua barang dan jasa tersimpan di sini. Cari, ubah harganya, atau hapus yang sudah tidak dipakai.',
        side: 'top',
      },
    ],
  },

  /** Per-menu tour for settings. */
  settings: {
    id: 'settings',
    steps: [
      {
        target: 'settings-profile',
        title: 'Profil kamu',
        description: 'Isi nama, kontak, dan logo usaha. Data ini akan dipakai di nota berikutnya.',
        side: 'bottom',
      },
      {
        target: 'settings-tour',
        title: 'Putar ulang tur',
        description: 'Kapan saja kamu butuh bantuan, mulai lagi tur dari tombol ini.',
        side: 'top',
      },
    ],
  },
};

export function getTour(id: string): TourDef | undefined {
  return TOURS[id];
}
