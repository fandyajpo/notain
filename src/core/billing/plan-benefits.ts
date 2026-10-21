/**
 * What each plan actually includes — the single source for the pricing page's
 * cards and the billing page's "plan kamu" / "plan tersedia" lists.
 *
 * These are display strings describing product entitlements, not entitlement
 * rules: `isSubscriptionActive` in this same folder is what decides access.
 * Keeping the copy here means the two surfaces can never describe a plan
 * differently.
 */

export type PlanTier = 'free' | 'pro' | 'business';

export const PLAN_TIER_IDS: readonly PlanTier[] = ['free', 'pro', 'business'];

export const PLAN_TAGLINES: Record<PlanTier, string> = {
  free: 'Semua fitur inti untuk bikin dan kirim nota.',
  pro: 'Untuk bisnis yang makin sering kirim nota.',
  business: 'Untuk tim dan developer yang butuh akses API.',
};

export const PLAN_BENEFITS: Record<PlanTier, readonly string[]> = {
  free: [
    'Invoice tanpa batas',
    'Kalkulator otomatis: diskon, pajak, pembulatan',
    'PDF A4 rapi, siap cetak',
    'Kirim ke WhatsApp dalam satu ketukan',
    'Kelola data pelanggan',
    'Template bawaan & upload logo bisnis',
    'Export riwayat invoice ke Excel',
    'Data tersimpan di akun, aman ganti perangkat',
  ],
  pro: [
    'Semua fitur di Free',
    'Template premium dengan desain nota lebih variatif',
    'Warna & branding sendiri di setiap nota',
    'Invoice link: customer buka nota tanpa download',
    'Laporan bisnis: ringkasan penjualan & pendapatan',
    'Penyimpanan cloud lebih besar',
    'Dukungan prioritas',
  ],
  business: [
    'Semua fitur di Pro',
    'API key untuk akses programatik',
    'Multi API key untuk tim & integrasi',
    'Webhook event invoice (created, paid, dll)',
    'Rate limit lebih tinggi',
    'Dukungan prioritas',
  ],
};

/** Display price for a tier. The server prices checkout from `PAID_PLANS`. */
export const PLAN_PRICES: Record<PlanTier, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: 'selamanya' },
  pro: { amount: 'Rp 29.000', period: '/bulan' },
  business: { amount: 'Rp 99.000', period: '/bulan' },
};
