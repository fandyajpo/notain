import { describe, expect, it } from 'vite-plus/test';
import { forgotPasswordSchema, resetPasswordSchema } from './schema';

describe('forgotPasswordSchema', () => {
  it('trims the email on the way through', () => {
    expect(forgotPasswordSchema.parse({ email: '  kamu@email.com ' })).toEqual({
      email: 'kamu@email.com',
    });
  });

  it('rejects a blank email', () => {
    expect(forgotPasswordSchema.safeParse({ email: '   ' }).success).toBe(false);
  });

  it('rejects an email without a domain', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'kamu@' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a matching password pair', () => {
    expect(
      resetPasswordSchema.parse({ password: 'rahasia123', confirmPassword: 'rahasia123' }),
    ).toEqual({ password: 'rahasia123', confirmPassword: 'rahasia123' });
  });

  it('rejects a password shorter than the minimum', () => {
    const result = resetPasswordSchema.safeParse({ password: 'abc', confirmPassword: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects a confirmation that does not match', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'rahasia123',
      confirmPassword: 'rahasia999',
    });
    expect(result.success).toBe(false);
  });
});
