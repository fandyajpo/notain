import { describe, expect, it } from 'vitest';
import {
  addDaysIsoDate,
  diffDaysIsoDate,
  formatTanggal,
  formatTanggalRelatif,
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
