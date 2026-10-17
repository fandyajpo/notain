import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';
import type { Invoice, InvoiceDraft } from '../core/invoice/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { getById, update, updateStatus, listByOwner, create } = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  listByOwner: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    invoices: { getById, update, updateStatus, listByOwner, create },
  },
}));

const { updateInvoice, updateInvoiceStatus } = await import('./invoices');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  ownerId: ALICE.id,
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-01',
  status: null,
  customerName: 'Budi Santoso',
  items: [{ id: 'item-1', name: 'Kopi', quantity: 1, unitPrice: 10000 }],
  discount: { type: 'amount', value: 0 },
  tax: { type: 'amount', value: 0 },
  sections: { header: '', content: '', footer: '' },
  details: {},
  createdAt: '2026-10-01T00:00:00.000+00:00',
  updatedAt: '2026-10-01T00:00:00.000+00:00',
  ...over,
});

const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  invoiceNumber: 'INV-2026-001',
  date: '2026-10-01',
  status: null,
  customerName: 'Budi Santoso',
  items: [{ id: 'item-1', name: 'Kopi', quantity: 1, unitPrice: 10000 }],
  discount: { type: 'amount', value: 0 },
  tax: { type: 'amount', value: 0 },
  sections: { header: '', content: '', footer: '' },
  details: {},
  ...over,
});

async function expectValidationFailure(run: () => Promise<unknown>, messagePart: string) {
  const error = await run().then(
    () => null,
    (thrown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(ERROR_CODES.VALIDATION);
  expect((error as AppError).message).toContain(messagePart);
}

beforeEach(() => {
  forgetSession();
  getSession.mockReset();
  getSession.mockResolvedValue(ALICE);
  getById.mockReset();
  update.mockReset();
  updateStatus.mockReset();
  listByOwner.mockReset();
  create.mockReset();
});

describe('updateInvoiceStatus lifecycle guard', () => {
  it('allows the forward steps of the chain', async () => {
    for (const [from, to] of [
      [null, 'sent'],
      ['sent', 'paid'],
      ['sent', 'void'],
    ] as const) {
      updateStatus.mockReset();
      getById.mockResolvedValue(invoice({ status: from }));
      const updated = invoice({ status: to });
      updateStatus.mockResolvedValue(updated);

      await expect(updateInvoiceStatus('inv-1', to)).resolves.toEqual(updated);
      expect(updateStatus).toHaveBeenCalledWith({ id: 'inv-1', status: to });
    }
  });

  it('refuses to jump from unset straight to a terminal state', async () => {
    getById.mockResolvedValue(invoice({ status: null }));
    await expectValidationFailure(() => updateInvoiceStatus('inv-1', 'paid'), 'Terkirim');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('refuses any backwards move', async () => {
    getById.mockResolvedValue(invoice({ status: 'paid' }));
    await expectValidationFailure(() => updateInvoiceStatus('inv-1', 'sent'), 'status akhir');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('refuses both terminal states from each other', async () => {
    getById.mockResolvedValue(invoice({ status: 'void' }));
    await expectValidationFailure(() => updateInvoiceStatus('inv-1', 'paid'), 'status akhir');

    getById.mockResolvedValue(invoice({ status: 'paid' }));
    await expectValidationFailure(() => updateInvoiceStatus('inv-1', 'void'), 'status akhir');
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('treats a re-pick of the current status as an allowed no-op', async () => {
    getById.mockResolvedValue(invoice({ status: 'paid' }));
    const updated = invoice({ status: 'paid' });
    updateStatus.mockResolvedValue(updated);

    await expect(updateInvoiceStatus('inv-1', 'paid')).resolves.toEqual(updated);
  });

  it('rejects a value outside the enum before even reading the row', async () => {
    await expectValidationFailure(
      () => updateInvoiceStatus('inv-1', 'draft' as never),
      'tidak valid',
    );
    expect(getById).not.toHaveBeenCalled();
  });

  it('404s on an invoice the caller does not own', async () => {
    getById.mockResolvedValue(null);
    await expect(updateInvoiceStatus('inv-1', 'sent')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(updateStatus).not.toHaveBeenCalled();
  });
});

describe('updateInvoice never writes the lifecycle status', () => {
  it('saves contents even when the draft carries a stale forward status', async () => {
    getById.mockResolvedValue(invoice({ status: 'sent' }));
    const updated = invoice({ status: 'sent' });
    update.mockResolvedValue(updated);

    // The form still ships whatever status it holds, but the app layer no
    // longer validates it: the repository omits the column from the write.
    await expect(updateInvoice('inv-1', draft({ status: 'paid' }))).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({ id: 'inv-1', draft: expect.any(Object) });
  });

  it('saves contents of a terminal invoice without any status objection', async () => {
    getById.mockResolvedValue(invoice({ status: 'paid' }));
    const updated = invoice({ status: 'paid' });
    update.mockResolvedValue(updated);

    await expect(updateInvoice('inv-1', draft({ status: 'sent' }))).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({ id: 'inv-1', draft: expect.any(Object) });
  });

  it('accepts a draft that would clear the status back to unset', async () => {
    getById.mockResolvedValue(invoice({ status: 'sent' }));
    const updated = invoice({ status: 'sent' });
    update.mockResolvedValue(updated);

    await expect(updateInvoice('inv-1', draft({ status: null }))).resolves.toEqual(updated);
    expect(update).toHaveBeenCalledWith({ id: 'inv-1', draft: expect.any(Object) });
  });

  it('still 404s on an invoice the caller does not own', async () => {
    getById.mockResolvedValue(null);
    await expect(updateInvoice('inv-1', draft())).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
