/**
 * The password-reset token: minting, hashing, and the one row per account that
 * holds it.
 *
 * Kept out of the two endpoints because they have to agree exactly: what counts
 * as a valid token, what the row id is, how long it lives. A token is 32 random
 * bytes as hex — 256 bits, unguessable, and safe in a URL. The database stores
 * only its SHA-256, so a leaked table cannot be replayed; the hash is also the
 * lookup key, which is what lets a link be redeemed without knowing whose it
 * is.
 *
 * The row is keyed by the ACCOUNT, not by the token, so one account can only
 * ever have one live reset link: requesting a second one invalidates the first.
 */

/** How long a link stays valid. Quoted in the email, so both sides read it here. */
export const RESET_TOKEN_TTL_MINUTES = 30;

const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** A fresh 256-bit token as lowercase hex (64 characters). */
export function newResetToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Whether a value from a URL could be one of our tokens at all. */
export function isResetToken(value: unknown): value is string {
  return typeof value === 'string' && RESET_TOKEN_PATTERN.test(value);
}

/** SHA-256 hex — the only form of the token that is stored. */
export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The row id for an account's reset token: `pwreset_<16 hex of sha256(userId)>`.
 *
 * Deterministic on purpose. Appwrite has no upsert, so a second request reads
 * this id, finds the row the first one wrote, and patches a new token over it —
 * one bounded row per account instead of an ever-growing history of dead links.
 */
export async function resetRowId(userId: string): Promise<string> {
  const hash = await hashResetToken(`notain:password-reset:${userId}`);
  return `pwreset_${hash.slice(0, 16)}`;
}

/** ISO instant a token minted now stops working. */
export function resetExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000).toISOString();
}
