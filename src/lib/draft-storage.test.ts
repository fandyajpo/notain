// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createEmptyDraft } from '../core/invoice/model';
import { clearDraft, draftStorageKey, readDraft, writeDraft } from './draft-storage';

const ALICE = 'user-alice';
const BOB = 'user-bob';

function someDraft(invoiceNumber = 'INV-2026-001') {
  return createEmptyDraft(invoiceNumber, '2026-10-12');
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('draftStorageKey', () => {
  it('scopes the key by owner so accounts cannot collide', () => {
    expect(draftStorageKey(ALICE, undefined)).not.toBe(draftStorageKey(BOB, undefined));
    expect(draftStorageKey(ALICE, 'inv-1')).not.toBe(draftStorageKey(BOB, 'inv-1'));
  });

  it('falls back to `new` for an in-progress invoice', () => {
    expect(draftStorageKey(ALICE, undefined)).toContain(':new');
    expect(draftStorageKey(ALICE, 'inv-1')).toContain(':inv-1');
  });

  it('returns null for an empty owner, so no shared key can ever be used', () => {
    expect(draftStorageKey('', undefined)).toBeNull();
  });
});

describe('readDraft / writeDraft', () => {
  it('does not hand one account’s draft to another on the same browser', () => {
    writeDraft(ALICE, undefined, someDraft());

    // The exact bug this scoping exists to prevent: Bob opens /invoice/new on
    // the same browser and must not see Alice's in-progress invoice.
    expect(readDraft(BOB, undefined)).toBeNull();
    expect(readDraft(ALICE, undefined)).not.toBeNull();
  });

  it('keeps drafts for the same owner across reloads', () => {
    const draft = someDraft('INV-2026-077');
    writeDraft(ALICE, undefined, draft);

    expect(readDraft(ALICE, undefined)?.invoiceNumber).toBe('INV-2026-077');
  });

  it('scopes drafts of a specific invoice id too', () => {
    writeDraft(ALICE, 'inv-9', someDraft());

    expect(readDraft(BOB, 'inv-9')).toBeNull();
    expect(readDraft(ALICE, 'inv-9')).not.toBeNull();
  });

  it('never reads or writes without a scope', () => {
    writeDraft('', undefined, someDraft());

    expect(window.localStorage.length).toBe(0);
    expect(readDraft('', undefined)).toBeNull();
  });

  it('ignores corrupt or non-schema localStorage content instead of throwing', () => {
    window.localStorage.setItem(draftStorageKey(ALICE, undefined) as string, '{not json');
    expect(readDraft(ALICE, undefined)).toBeNull();

    window.localStorage.setItem(draftStorageKey(ALICE, undefined) as string, '{"foo":1}');
    expect(readDraft(ALICE, undefined)).toBeNull();
  });

  it('reads nothing when the key was never written', () => {
    expect(readDraft(BOB, undefined)).toBeNull();
  });

  it('restores a work-in-progress draft that is not yet valid for submit', () => {
    // Regression: `invoiceDraftSchema` requires a customer name and at least
    // one named item, so validating a restored draft against it discarded
    // every incomplete draft — the exact case autosave exists for.
    const draft = createEmptyDraft('INV-2026-050', '2026-10-12');
    draft.items = [{ id: 'item-1', name: '', quantity: 1, unitPrice: 0 }];

    writeDraft(ALICE, undefined, draft);

    const restored = readDraft(ALICE, undefined);
    expect(restored).not.toBeNull();
    expect(restored?.customerName).toBe('');
    expect(restored?.items).toHaveLength(1);
  });

  it('still rejects content that is not draft-shaped at all', () => {
    window.localStorage.setItem(draftStorageKey(ALICE, undefined) as string, '["not","a","draft"]');

    expect(readDraft(ALICE, undefined)).toBeNull();
  });
});

describe('clearDraft', () => {
  it('removes only the caller’s own draft', () => {
    writeDraft(ALICE, undefined, someDraft());
    writeDraft(BOB, undefined, someDraft('INV-2026-002'));

    clearDraft(ALICE, undefined);

    expect(readDraft(ALICE, undefined)).toBeNull();
    expect(readDraft(BOB, undefined)).not.toBeNull();
  });

  it('is a safe no-op without a scope', () => {
    expect(() => clearDraft('', undefined)).not.toThrow();
  });
});
