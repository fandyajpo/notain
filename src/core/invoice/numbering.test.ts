import { describe, expect, it } from 'vitest';
import {
  extractInvoiceSequence,
  formatInvoiceNumber,
  isInvoiceNumber,
  nextInvoiceNumber,
} from './numbering';

describe('formatInvoiceNumber', () => {
  it('pads the sequence to three digits', () => {
    expect(formatInvoiceNumber(2026, 7)).toBe('INV-2026-007');
  });

  it('grows the sequence instead of wrapping', () => {
    expect(formatInvoiceNumber(2026, 1234)).toBe('INV-2026-1234');
  });
});

describe('extractInvoiceSequence', () => {
  it('reads the sequence for the matching year', () => {
    expect(extractInvoiceSequence('INV-2026-042', 2026)).toBe(42);
  });

  it('ignores numbers from another year', () => {
    expect(extractInvoiceSequence('INV-2025-042', 2026)).toBeNull();
  });

  it('ignores malformed numbers', () => {
    expect(extractInvoiceSequence('INV-2026-', 2026)).toBeNull();
    expect(extractInvoiceSequence('INV-2026-000', 2026)).toBeNull();
    expect(extractInvoiceSequence('nota-2026-001', 2026)).toBeNull();
  });
});

describe('nextInvoiceNumber', () => {
  const now = new Date(Date.UTC(2026, 4, 1));

  it('starts at 001 when nothing exists', () => {
    expect(nextInvoiceNumber([], now)).toBe('INV-2026-001');
  });

  it('takes the highest existing sequence for the current year', () => {
    expect(nextInvoiceNumber(['INV-2026-003', 'INV-2026-010'], now)).toBe('INV-2026-011');
  });

  it('skips numbers from other years', () => {
    expect(nextInvoiceNumber(['INV-2025-099'], now)).toBe('INV-2026-001');
  });

  it('tolerates malformed entries', () => {
    expect(nextInvoiceNumber(['garbage', 'INV-2026-002'], now)).toBe('INV-2026-003');
  });
});

describe('isInvoiceNumber', () => {
  it('accepts the canonical format', () => {
    expect(isInvoiceNumber('INV-2026-001')).toBe(true);
    expect(isInvoiceNumber('INV-2026-123456')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isInvoiceNumber('inv-2026-001')).toBe(false);
    expect(isInvoiceNumber('INV-26-001')).toBe(false);
    expect(isInvoiceNumber('INV-2026-1')).toBe(false);
    expect(isInvoiceNumber('')).toBe(false);
  });
});
