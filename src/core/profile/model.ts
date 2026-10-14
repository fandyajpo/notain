import '../zod-csp';
import { z } from 'zod';

export const PROFILE_LIMITS = {
  name: 128,
  businessName: 128,
  phone: 32,
  address: 256,
  email: 128,
} as const;

/** Subscription tiers. `free` is the default for every new account. */
export const PLAN_VALUES = ['free', 'pro', 'business'] as const;
export type Plan = (typeof PLAN_VALUES)[number];

export type BusinessProfile = {
  name: string;
  businessName: string;
  phone: string;
  address?: string;
  email?: string;
  logoFileId?: string;
  logoUrl?: string;
  plan: Plan;
  /** ISO date string. `null` means no expiry (lifetime or free). */
  planExpiresAt: string | null;
};

export const EMPTY_PROFILE: BusinessProfile = {
  name: '',
  businessName: '',
  phone: '',
  plan: 'free',
  planExpiresAt: null,
};

/** True when the profile's paid plan is still active (not expired). */
export function isPlanActive(profile: BusinessProfile): boolean {
  if (profile.plan === 'free') return false;
  if (profile.planExpiresAt === null) return true;
  return new Date(profile.planExpiresAt).getTime() > Date.now();
}

/** True when the user has an active Pro or Business plan. */
export function hasProAccess(profile: BusinessProfile): boolean {
  return isPlanActive(profile);
}

/** True when the user has an active Business plan. */
export function hasBusinessAccess(profile: BusinessProfile): boolean {
  return profile.plan === 'business' && isPlanActive(profile);
}

const phonePattern = /^(?:\+?62|0)8\d{7,12}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Masukkan nama kamu terlebih dahulu.')
    .max(PROFILE_LIMITS.name, 'Nama terlalu panjang.'),
  businessName: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1, 'Masukkan nama usaha terlebih dahulu.')
      .max(PROFILE_LIMITS.businessName, 'Nama usaha terlalu panjang.')
      .optional(),
  ),
  phone: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(phonePattern, 'Masukkan nomor WhatsApp yang valid, contoh 081234567890.')
      .optional(),
  ),
  address: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(PROFILE_LIMITS.address, 'Alamat terlalu panjang').optional(),
  ),
  email: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .refine((value) => emailPattern.test(value), { message: 'Masukkan email yang valid.' })
      .optional(),
  ),
  logoFileId: z.preprocess(emptyToUndefined, z.string().trim().max(64).optional()),
  plan: z.enum(PLAN_VALUES).default('free'),
  planExpiresAt: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(32).nullable().optional(),
  ),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * The settings form keeps every value as a filled string so the controlled
 * inputs stay simple. Empty optional fields are turned back into `undefined`
 * when the profile is persisted.
 */
export const profileFormSchema = z.object({
  name: profileSchema.shape.name,
  businessName: z.string().trim().max(PROFILE_LIMITS.businessName, 'Nama usaha terlalu panjang.'),
  // Mirrors the email field below: the settings form keeps every value as a
  // filled string, so an empty phone is valid and only a non-empty one is
  // checked against the pattern. (`profileSchema.shape.phone` is a preprocess
  // wrapper whose input type is `unknown`, so it cannot back a string field.)
  phone: z
    .string()
    .trim()
    .refine((value) => value === '' || phonePattern.test(value), {
      message: 'Masukkan nomor WhatsApp yang valid, contoh 081234567890.',
    }),
  address: z.string().trim().max(PROFILE_LIMITS.address, 'Alamat terlalu panjang.'),
  email: z
    .string()
    .trim()
    .max(PROFILE_LIMITS.email, 'Email terlalu panjang.')
    .refine((value) => value === '' || emailPattern.test(value), {
      message: 'Masukkan email yang valid.',
    }),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
