/** Calendar-date helpers. Dates are ISO `YYYY-MM-DD` strings, never timestamps. */

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, positive when `to` is the later date. */
export function diffDaysIsoDate(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

function toUtcMidnight(value: string | Date): number {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * `11 Oktober 2026` for a date-only `YYYY-MM-DD` column or a full ISO
 * timestamp.
 *
 * The date-only columns are treated as UTC so the formatted day never shifts
 * with the reader's timezone. ISO timestamps (how `planExpiresAt` and the
 * payment columns are stored) are parsed as-is: appending the midnight suffix
 * to an already-complete stamp would produce an invalid date and print
 * nothing at all.
 */
export function formatTanggal(value: string | Date, locale = 'id-ID'): string {
  const raw = value instanceof Date ? value : value.includes('T') ? value : `${value}T00:00:00Z`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatTanggalRelatif(value: string | Date, now: Date = new Date()): string {
  const then = toUtcMidnight(value);
  if (Number.isNaN(then)) return '';
  const today = toUtcMidnight(now);
  const diffDays = Math.round((today - then) / 86_400_000);

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} hari lalu`;
  return formatTanggal(value);
}

/**
 * How long ago a *timestamp* was, at the granularity a cache caption needs:
 * "Baru saja" under a minute, then minutes, then hours, and day granularity
 * (`formatTanggalRelatif`) once a full day has passed. Returns '' for an
 * unparseable value.
 */
export function formatWaktuLalu(value: string | Date, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return '';

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 60_000) return 'Baru saja';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} menit lalu`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} jam lalu`;

  return formatTanggalRelatif(then, now);
}

/**
 * Time-of-day greeting for a screen's headline: "Selamat pagi" up to 10.59,
 * then siang, sore, and malam from 18.00. The hour decides, not the date.
 */
export function formatSalam(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Selamat pagi 👋';
  if (hour < 15) return 'Selamat siang 👋';
  if (hour < 18) return 'Selamat sore 👋';
  return 'Selamat malam 👋';
}
