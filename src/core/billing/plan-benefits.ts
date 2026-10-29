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
  pro: 'Untuk bisnis yang makin sering kirim nota.',
  business: 'Untuk integrasi.',
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
    `${FREE_PLAN_LIMITS.invoicesPerMonth} invoice baru per bulan`,
    '1 organisasi (workspace)',
    'Kalkulator otomatis: diskon, pajak, pembulatan',
    'PDF A4 siap cetak',
    'Kelola pelanggan',
    'Template bawaan dan upload logo',
    'Ekspor riwayat invoice ke Excel',
    'Dukungan prioritas',
  ],
  pro: [
    'Semua fitur Free',
    'Buat lebih dari 1 organisasi (workspace)',
    'Invoice tanpa batas dengan kebijakan penggunaan wajar',
    'Invoice link untuk pelanggan',
    'Template kustom sendiri: urutan blok, warna, dan branding di setiap nota',
    'Dukungan prioritas',
  ],
  business: [
    'Semua fitur Pro',
    'API key untuk akses programatik',
    'Multi API key',
    'Webhook invoice: created, paid, dan event lain yang didukung',
    'Rate limit lebih tinggi',
    'Dukungan prioritas untuk integrasi',
  ],
};

/** Display price for a tier. The server prices checkout from `PAID_PLANS`. */
export const PLAN_PRICES: Record<PlanTier, { amount: string; period: string }> = {
  free: { amount: 'Rp 0', period: 'selamanya' },
  pro: { amount: 'Rp 49.000', period: '/bulan' },
  business: { amount: 'Rp 99.000', period: '/bulan' },
};

/**
 * The annual alternative, shown as a savings note under the monthly price.
 *
 * Display copy only: checkout sells a single 30-day period and has no annual
 * SKU, so this is the honest form of "you could pay yearly" — a comparison,
 * not a product you can buy. The discount is derived from the monthly price
 * and the round annual price below, so raising `PAID_PLANS` can never leave a
 * stale "hemat Rp…" figure on the page.
 */
export const PLAN_YEARLY_PRICES: Partial<Record<PaidPlanTier, number>> = {
  pro: 490_000,
  business: 990_000,
};

/** The two tiers that can be bought, in catalog order. */
type PaidPlanTier = 'pro' | 'business';

/**
 * The yearly line for a paid tier: `"Rp 490.000 / tahun — hemat Rp 98.000 …"`,
 * or `null` when the tier has no annual figure. The saving is computed, never
 * typed: 12 × monthly minus the annual price, formatted in the same dotted
 * Rupiah style as the rest of the pricing copy.
 */
export function yearlySavingNote(tier: PaidPlanTier): string | null {
  const annual = PLAN_YEARLY_PRICES[tier];
  const monthly = PLAN_PRICES[tier].amount;
  if (annual === undefined) return null;
  const fullPrice = parseIdrAmount(monthly) * 12;
  const saving = fullPrice - annual;
  return `${formatIdr(annual)} / tahun — hemat ${formatIdr(saving)} dibanding pembayaran bulanan selama 12 bulan.`;
}

/** `"Rp 49.000"` → `49000`. Returns 0 for anything that is not an Rupiah figure. */
function parseIdrAmount(amount: string): number {
  const digits = amount.replace(/[^0-9]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** `49000` → `"Rp 490.000"` — the dotted Indonesian grouping the copy uses. */
function formatIdr(value: number): string {
  const grouped = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${value < 0 ? '-' : ''}${grouped}`;
}
