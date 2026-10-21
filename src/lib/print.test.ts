// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createSampleInvoice } from '../core/invoice/sample';
import { PRINT_PATH, openPrintView, readPrintPayload } from './print';

const KEY = 'notain:print';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('openPrintView', () => {
  it('carries the draft to the print view through sessionStorage', () => {
    const { draft } = createSampleInvoice();
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus: () => {} } as Window);

    expect(openPrintView(draft)).toBe(true);
    expect(open).toHaveBeenCalledWith(PRINT_PATH, '_blank');
    expect(readPrintPayload()?.invoiceNumber).toBe(draft.invoiceNumber);
    expect(readPrintPayload()?.sections.footer).toBe(draft.sections.footer);
  });

  it('sends unsaved edits, not the persisted invoice', () => {
    const { draft } = createSampleInvoice();
    draft.customerName = 'Belum disimpan';
    vi.spyOn(window, 'open').mockReturnValue({ focus: () => {} } as Window);

    openPrintView(draft);

    expect(readPrintPayload()?.customerName).toBe('Belum disimpan');
  });

  it('navigates this tab instead when the popup is blocked', () => {
    // jsdom cannot be told to navigate, so the fallback path only reports that
    // it tried. The return value and the payload are what matter here.
    vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openPrintView(createSampleInvoice().draft)).toBe(false);
    expect(readPrintPayload()).not.toBeNull();
  });

  it('still opens the print view when storage is unavailable', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus: () => {} } as Window);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(openPrintView(createSampleInvoice().draft)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    // Nothing could be written, so the print view reports a missing payload
    // rather than printing blanks.
    expect(readPrintPayload()).toBeNull();
  });
});

describe('readPrintPayload', () => {
  it('returns null when nothing was handed over', () => {
    expect(readPrintPayload()).toBeNull();
  });

  it('returns null when the payload is not an invoice', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ hello: 'world' }));

    expect(readPrintPayload()).toBeNull();
  });

  it('survives a corrupt payload', () => {
    sessionStorage.setItem(KEY, '{not json');

    expect(readPrintPayload()).toBeNull();
  });
});
