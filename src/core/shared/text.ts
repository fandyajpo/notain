/**
 * Narrow an `unknown` column value to text without `[object Object]`.
 *
 * Appwrite rows are typed `Record<string, unknown>` — a column can hold
 * anything — and `String(value)` on such a value stringifies to
 * `"[object Object]"`, which then leaks into audit trails, admin tables and
 * test assertions as if it were data. This keeps the primitive conversions a
 * `String()` gave us, renders dates as ISO, and serialises anything else the
 * way the API actually stores it.
 *
 * Returns `''` for `null`/`undefined`, matching the `?? ''` these call sites
 * used before.
 */
export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Cyclic or non-serialisable — better a fallback than a thrown render.
    return '';
  }
}
