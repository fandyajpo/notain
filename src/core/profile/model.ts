import '../zod-csp';
import { z } from 'zod';

export const PROFILE_LIMITS = {
  name: 128,
  phone: 32,
  address: 256,
  email: 128,
} as const;

export type BusinessProfile = {
  name: string;
  phone: string;
  address?: string;
  email?: string;
  logoFileId?: string;
  logoUrl?: string;
};

export const EMPTY_PROFILE: BusinessProfile = { name: '', phone: '' };

const phonePattern = /^(?:\+?62|0)8\d{7,12}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Masukkan nama usaha terlebih dahulu.')
    .max(PROFILE_LIMITS.name, 'Nama usaha terlalu panjang.'),
  phone: z
    .string()
    .trim()
    .regex(phonePattern, 'Masukkan nomor WhatsApp yang valid, contoh 081234567890.'),
  address: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(PROFILE_LIMITS.address, 'Alamat terlalu panjang.').optional(),
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
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * The settings form keeps every value as a filled string so the controlled
 * inputs stay simple. Empty optional fields are turned back into `undefined`
 * when the profile is persisted.
 */
export const profileFormSchema = z.object({
  name: profileSchema.shape.name,
  phone: profileSchema.shape.phone,
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
