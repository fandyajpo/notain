import { describe, expect, it } from 'vitest';
import {
  invoiceEditCanonicalTarget,
  invoiceIdFromLocation,
  templateEditCanonicalTarget,
  templateEditorTargetFromLocation,
} from './edit-route';

const at = (url: string) => {
  const parsed = new URL(url, 'https://notain.example');
  return { pathname: parsed.pathname, search: parsed.search };
};

describe('invoiceIdFromLocation', () => {
  it('reads the id out of the path, the way new links are written', () => {
    expect(invoiceIdFromLocation(at('/invoice/6acc91d70002fd3e80b4'))).toBe('6acc91d70002fd3e80b4');
    expect(invoiceIdFromLocation(at('/invoice/6acc91d70002fd3e80b4/'))).toBe(
      '6acc91d70002fd3e80b4',
    );
    expect(invoiceIdFromLocation(at('/invoice/6acc91d70002fd3e80b4?tab=items'))).toBe(
      '6acc91d70002fd3e80b4',
    );
  });

  it('still accepts the older query form, and prefers it when both are present', () => {
    expect(invoiceIdFromLocation(at('/invoice/edit?id=fromquery'))).toBe('fromquery');
    expect(invoiceIdFromLocation(at('/invoice/edit?id=fromquery&auto=1'))).toBe('fromquery');
    expect(invoiceIdFromLocation(at('/invoice/inpath?id=fromquery'))).toBe('fromquery');
  });

  it('never treats a route of its own as an id', () => {
    expect(invoiceIdFromLocation(at('/invoice/new'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/new?from=abc'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/print'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/edit'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/edit?id=print'))).toBeUndefined();
  });

  it('rejects paths that are not a single clean segment', () => {
    expect(invoiceIdFromLocation(at('/invoice'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/a/b'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoice/has space'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/dashboard'))).toBeUndefined();
    expect(invoiceIdFromLocation(at('/invoices'))).toBeUndefined();
  });
});

describe('templateEditorTargetFromLocation', () => {
  it('opens the template named in the path', () => {
    expect(templateEditorTargetFromLocation(at('/templates/tpl_123'))).toEqual({
      id: 'tpl_123',
      seedId: null,
    });
  });

  it('opens a blank editor for the new route', () => {
    expect(templateEditorTargetFromLocation(at('/templates/new'))).toEqual({
      id: undefined,
      seedId: null,
    });
    expect(templateEditorTargetFromLocation(at('/templates/edit'))).toEqual({
      id: undefined,
      seedId: null,
    });
  });

  it('carries the copy seed through', () => {
    expect(templateEditorTargetFromLocation(at('/templates/new?from=modern'))).toEqual({
      id: undefined,
      seedId: 'modern',
    });
  });

  it('still accepts the older query form for an edit', () => {
    expect(templateEditorTargetFromLocation(at('/templates/edit?id=tpl_123'))).toEqual({
      id: 'tpl_123',
      seedId: null,
    });
  });
});

describe('invoiceEditCanonicalTarget', () => {
  it('folds a usable ?id= onto the path route', () => {
    expect(invoiceEditCanonicalTarget('?id=6acc91d70002fd3e80b4')).toBe(
      '/invoice/6acc91d70002fd3e80b4',
    );
    expect(invoiceEditCanonicalTarget('?id=6acc91d70002fd3e80b4&auto=1')).toBe(
      '/invoice/6acc91d70002fd3e80b4',
    );
  });

  it('has no target when there is no usable id', () => {
    expect(invoiceEditCanonicalTarget('')).toBeUndefined();
    expect(invoiceEditCanonicalTarget('?tab=items')).toBeUndefined();
    expect(invoiceEditCanonicalTarget('?id=new')).toBeUndefined();
    expect(invoiceEditCanonicalTarget('?id=print')).toBeUndefined();
    expect(invoiceEditCanonicalTarget('?id=has%20space')).toBeUndefined();
  });
});

describe('templateEditCanonicalTarget', () => {
  it('prefers the id', () => {
    expect(templateEditCanonicalTarget('?id=tpl_123')).toBe('/templates/tpl_123');
    expect(templateEditCanonicalTarget('?id=tpl_123&from=modern')).toBe('/templates/tpl_123');
  });

  it('carries the copy seed through to /templates/new', () => {
    expect(templateEditCanonicalTarget('?from=modern')).toBe('/templates/new?from=modern');
  });

  it('falls back to the blank editor', () => {
    expect(templateEditCanonicalTarget('')).toBe('/templates/new');
    expect(templateEditCanonicalTarget('?id=new')).toBe('/templates/new');
    expect(templateEditCanonicalTarget('?id=has%20space')).toBe('/templates/new');
  });
});
