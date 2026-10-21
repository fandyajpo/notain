import { describe, expect, it } from 'vitest';
import {
  addDaysIsoDate,
  diffDaysIsoDate,
  formatSalam,
  formatTanggal,
  formatTanggalRelatif,
  formatWaktuLalu,
  isIsoDate,
  todayIsoDate,
} from './dates';

describe('isIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2026-10-11')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects impossible dates and wrong shapes', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('11/10/2026')).toBe(false);
    expect(isIsoDate(20261011)).toBe(false);
  });
});

describe('todayIsoDate', () => {
  it('formats the local calendar day as YYYY-MM-DD', () => {
    const now = new Date(2026, 9, 11, 23, 59);
    expect(todayIsoDate(now)).toBe('2026-10-11');
  });
});

describe('addDaysIsoDate', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysIsoDate('2026-10-30', 5)).toBe('2026-11-04');
  });

  it('adds days across year boundaries', () => {
    expect(addDaysIsoDate('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('handles negative offsets', () => {
    expect(addDaysIsoDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is a no-op for zero days', () => {
    expect(addDaysIsoDate('2026-10-11', 0)).toBe('2026-10-11');
  });
});

describe('diffDaysIsoDate', () => {
  it('counts forward across month boundaries', () => {
    expect(diffDaysIsoDate('2026-10-30', '2026-11-04')).toBe(5);
  });

  it('is negative when the second date comes first', () => {
    expect(diffDaysIsoDate('2026-03-01', '2026-02-28')).toBe(-1);
  });

  it('is zero for the same day', () => {
    expect(diffDaysIsoDate('2026-10-11', '2026-10-11')).toBe(0);
  });

  it('round-trips with addDaysIsoDate', () => {
    expect(addDaysIsoDate('2026-10-11', 14)).toBe('2026-10-25');
    expect(diffDaysIsoDate('2026-10-11', '2026-10-25')).toBe(14);
  });
});

describe('formatTanggal', () => {
  it('renders Indonesian long dates in UTC', () => {
    expect(formatTanggal('2026-10-11')).toBe('11 Oktober 2026');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatTanggal('not-a-date')).toBe('');
  });
});

describe('formatTanggalRelatif', () => {
  const now = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));

  it('says hari ini for the same day', () => {
    expect(formatTanggalRelatif('2026-10-11', now)).toBe('Hari ini');
  });

  it('says kemarin for the previous day', () => {
    expect(formatTanggalRelatif('2026-10-10', now)).toBe('Kemarin');
  });

  it('counts days within a week', () => {
    expect(formatTanggalRelatif('2026-10-07', now)).toBe('4 hari lalu');
  });

  it('falls back to a full date beyond a week', () => {
    expect(formatTanggalRelatif('2026-10-03', now)).toBe('3 Oktober 2026');
  });
});

describe('formatWaktuLalu', () => {
  const now = new Date('2026-10-11T12:00:00.000Z');
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it('says baru saja under a minute', () => {
    expect(formatWaktuLalu(ago(0.5), now)).toBe('Baru saja');
  });

  it('counts minutes', () => {
    expect(formatWaktuLalu(ago(5), now)).toBe('5 menit lalu');
    expect(formatWaktuLalu(ago(59), now)).toBe('59 menit lalu');
  });

  it('counts hours once a minute count would be unreadable', () => {
    expect(formatWaktuLalu(ago(60), now)).toBe('1 jam lalu');
    expect(formatWaktuLalu(ago(5 * 60), now)).toBe('5 jam lalu');
  });

  it('hands over to the day-granular formatter after 24 hours', () => {
    expect(formatWaktuLalu(ago(24 * 60), now)).toBe('Kemarin');
    expect(formatWaktuLalu(ago(3 * 24 * 60), now)).toBe('3 hari lalu');
    expect(formatWaktuLalu(ago(10 * 24 * 60), now)).toBe('1 Oktober 2026');
  });

  it('returns an empty string for an invalid value', () => {
    expect(formatWaktuLalu('not-a-date', now)).toBe('');
  });

  it('treats a future timestamp as baru saja', () => {
    expect(formatWaktuLalu(new Date(now.getTime() + 30_000).toISOString(), now)).toBe('Baru saja');
  });
});

describe('formatSalam', () => {
  const at = (hour: number) => new Date(2026, 9, 21, hour, 30);

  it('greets by time of day', () => {
    expect(formatSalam(at(6))).toBe('Selamat pagi 👋');
    expect(formatSalam(at(10))).toBe('Selamat pagi 👋');
    expect(formatSalam(at(11))).toBe('Selamat siang 👋');
    expect(formatSalam(at(14))).toBe('Selamat siang 👋');
    expect(formatSalam(at(15))).toBe('Selamat sore 👋');
    expect(formatSalam(at(17))).toBe('Selamat sore 👋');
    expect(formatSalam(at(18))).toBe('Selamat malam 👋');
    expect(formatSalam(at(23))).toBe('Selamat malam 👋');
  });
});
