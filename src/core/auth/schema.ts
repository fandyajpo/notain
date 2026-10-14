import '../zod-csp';
import { z } from 'zod';

export const AUTH_LIMITS = {
  name: 64,
  email: 128,
  minPassword: 8,
  maxPassword: 128,
} as const;

const email = z
  .string()
  .trim()
  .min(1, 'Masukkan alamat email.')
  .max(AUTH_LIMITS.email, 'Email terlalu panjang.')
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Masukkan email yang valid.');

const password = z
  .string()
  .min(AUTH_LIMITS.minPassword, `Kata sandi minimal ${AUTH_LIMITS.minPassword} karakter.`)
  .max(AUTH_LIMITS.maxPassword, 'Kata sandi terlalu panjang.');

export const signInSchema = z.object({
  email,
  password,
});

/**
 * Step 1 of recovery: the user only has to know which email they registered
 * with. Submitting it never reveals whether the account exists — the app shows
 * the same "check your inbox" screen either way.
 */
export const forgotPasswordSchema = z.object({
  email,
});

/**
 * Step 2 of recovery, reached from the emailed link. `userId` and `secret`
 * come off the query string, not from the user, so the form only asks for the
 * new password.
 */
export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak sama.',
    path: ['confirmPassword'],
  });

export const signUpSchema = z
  .object({
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak sama.',
    path: ['confirmPassword'],
  });
