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
          'Jumlah faktur dan customer tampil di sini, selalu terbaru. Semua otomatis terhitung.',
        side: 'top',
      },
      {
        target: 'dash-create',
        title: 'Bikin invoice baru',
        description:
          'Ketuk tombol ini kapan saja. Isi data customer dan item, lalu totalnya dihitung otomatis: diskon, pajak, pembulatan.',
        side: 'bottom',
      },
      {
        target: 'dash-recent',
        title: 'Kelola & bagikan faktur',
        description:
          'Faktur terbaru ada di sini. Buka satu untuk melihat detail, unduh PDF A4, atau kirim langsung ke WhatsApp customer. Selamat berkarya!',
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
        description: 'Ketik nomor, nama customer, atau barang untuk menemukan invoice dalam sekejap.',
        side: 'bottom',
      },
      {
        target: 'invoices-filter',
        title: 'Saring berdasar status',
        description: 'Pilih status (Terkirim, Lunas, Batal) untuk menyaring daftar. Ketuk × untuk menghapus saringan.',
        side: 'bottom',
      },
      {
        target: 'invoices-table',
        title: 'Daftar invoice kamu',
        description:
          'Setiap baris menampilkan nomor, customer, tanggal, total, dan status. Ubah status langsung dari badge, atau buka invoice untuk detail, unduh, dan kirim.',
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
          'Invoice ini punya beberapa tab: Detail (customer), Barang (item), Kop, dan lainnya. Pindah tab untuk mengisi tiap bagian.',
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
          'Pratinjau invoice di samping selalu ikut terbaru. Selesai mengisi? Simpan invoice-nya.',
        side: 'left',
      },
    ],
  },

  /** Per-menu tour for customers. */
  customers: {
    id: 'customers',
    steps: [
      {
        target: 'cust-form',
        title: 'Tambah customer',
        description: 'Simpan nama, email, dan nomor WhatsApp supaya bisa dipakai ulang di invoice berikutnya.',
        side: 'bottom',
      },
      {
        target: 'cust-list',
        title: 'Daftar customer kamu',
        description:
          'Semua customer tercatat di sini. Cari, ubah datanya, atau gabungkan duplikat supaya daftar tetap rapi.',
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
        title: 'Profil usaha kamu',
        description:
          'Isi sekali di sini — nama, logo, dan data usaha ini yang otomatis dipakai di setiap invoice.',
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
