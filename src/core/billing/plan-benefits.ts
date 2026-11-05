import { FREE_PLAN_LIMITS } from './plans';

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
  free: 'Mulai gratis, tanpa kartu kredit.',
  pro: 'Buat nota lebih banyak dan akses fitur tambahan.',
  business: 'Untuk usaha yang butuh integrasi.',
};

/** The pill shown on a card the marketing wants highlighted, or `null`. */
export const PLAN_BADGES: Record<PlanTier, string | null> = {
  free: null,
  pro: 'Paling direkomendasikan',
  business: 'Segera hadir',
};

/**
 * Tiers that exist in the product but cannot be bought yet — Business is
 * announced, not sold. One flag drives every surface: the pricing page's CTA,
 * the billing page's plan choice, and the landing preview's badge, so no
 * screen can offer a checkout the server would refuse. `planChoice`
 * (`core/billing/plan-availability`) and the checkout API both read this
 * family of rules, and the server enforces the final say.
 */
export const PLAN_COMING_SOON: Record<PlanTier, boolean> = {
  free: false,
  pro: false,
  business: true,
};

/** The one label shown wherever a tier cannot be bought yet. */
export const PLAN_COMING_SOON_LABEL = 'Segera hadir';

/** Whether this tier is announced but not yet purchasable. */
export function isPlanComingSoon(tier: PlanTier): boolean {
  return PLAN_COMING_SOON[tier];
}

export const PLAN_BENEFITS: Record<PlanTier, readonly string[]> = {
  free: [
    `${FREE_PLAN_LIMITS.invoicesPerMonth} nota baru per bulan`,
    '1 usaha',
    'Hitung diskon, pajak, dan pembulatan otomatis',
    'Unduh PDF ukuran A4',
    'Simpan data pelanggan',
    'Template bawaan, buat template sendiri, dan unggah logo',
    'Ekspor riwayat transaksi ke Excel',
  ],
  pro: [
    'Semua fitur Free',
    'Buat beberapa usaha',
    'Buat nota tanpa batas selama paket aktif',
    'Bagikan tautan tagihan ke pelanggan',
    'Laporan usaha',
  ],
  business: [
    'Semua fitur Pro',
    'Kunci API untuk menghubungkan Notain ke aplikasi lain',
    'Buat beberapa kunci API',
    'Webhook untuk perubahan status nota',
    'Batas penggunaan API lebih tinggi',
  ],
};

/** Display price for a tier. The server prices checkout from `PAID_PLANS`. */
export const PLAN_PRICES: Record<PlanTier, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: 'selamanya' },
  pro: { amount: 'Rp 49.000', period: '/30 hari' },
  business: { amount: 'Rp 99.000', period: '/30 hari' },
};

