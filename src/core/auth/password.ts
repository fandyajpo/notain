/**
 * Password strength scoring for the register form's live meter.
 *
 * Deliberately simple — length plus character variety — because anything
 * more elaborate (dictionary checks, breach lists) needs a server round-trip
 * and this meter is purely a nudge, not a gate. The schema still enforces
 * the hard minimum of 8 characters regardless of score.
 */

export type PasswordStrength = {
  /** 0 = lemah, 1 = lumayan, 2 = kuat */
  score: 0 | 1 | 2;
  label: 'Lemah' | 'Lumayan' | 'Kuat';
  /** Tailwind classes for the meter bar and label text. */
  colorClass: string;
};

const STRENGTH: PasswordStrength[] = [
  { score: 0, label: 'Lemah', colorClass: 'bg-danger text-danger' },
  { score: 1, label: 'Lumayan', colorClass: 'bg-amber-500 text-amber-600' },
  { score: 2, label: 'Kuat', colorClass: 'bg-accent text-accent' },
];

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return STRENGTH[0]!;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^\w\s]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (password.length >= 12 && variety >= 3) return STRENGTH[2]!;
  if (password.length >= 8 && variety >= 2) return STRENGTH[1]!;
  if (password.length >= 8 && variety >= 1) return STRENGTH[1]!;
  return STRENGTH[0]!;
}

/** Width percentage for the meter bar (0–100). */
export function strengthPercent(strength: PasswordStrength): number {
  return ((strength.score + 1) / 3) * 100;
}
