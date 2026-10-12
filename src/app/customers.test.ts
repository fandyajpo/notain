import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';
import type { Customer } from '../core/customer/model';
import { AppError } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { listByOwner, findByName, create, update, remove } = vi.hoisted(() => ({
  listByOwner: vi.fn(),
  findByName: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    customers: { listByOwner, findByName, create, update, remove },
  },
}));

const { createCustomer, deleteCustomer, listCustomers, rememberCustomer, updateCustomer } =
  await import('./customers');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

const budi = (over: Partial<Customer> = {}): Customer => ({
  id: 'cus-1',
  name: 'Budi Santoso',
  phone: '081234567890',
  lastUsedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  // `session.ts` memoizes the user across tests; a stale cache would make the
  // "requires a session" cases see the previous account instead of a null.
  forgetSession();
  getSession.mockReset();
  listByOwner.mockReset();
  findByName.mockReset();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  getSession.mockResolvedValue(ALICE);
});

describe('listCustomers', () => {
  it('returns the owner’s directory', async () => {
    listByOwner.mockResolvedValue([budi()]);

    await expect(listCustomers()).resolves.toEqual([budi()]);
    expect(listByOwner).toHaveBeenCalledWith('user-a');
  });

  it('drops a row with a blank name — the picker has nothing to label it with', async () => {
    listByOwner.mockResolvedValue([budi({ name: '   ' }), budi({ id: 'cus-2', name: 'Siti' })]);

    const customers = await listCustomers();

    expect(customers.map((c) => c.name)).toEqual(['Siti']);
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(listCustomers()).rejects.toBeInstanceOf(AppError);
  });
});

describe('createCustomer', () => {
  it('trims both fields and stamps the creation time', async () => {
    create.mockResolvedValue(budi());

    await createCustomer({ name: '  Budi Santoso ', phone: ' 081234567890 ' });

    expect(create.mock.calls[0]?.[0].ownerId).toBe('user-a');
    expect(create.mock.calls[0]?.[0].customer).toEqual({
      name: 'Budi Santoso',
      phone: '081234567890',
    });
    expect(typeof create.mock.calls[0]?.[0].lastUsedAt).toBe('string');
  });

  it('rejects a blank name before it ever reaches storage', async () => {
    await expect(createCustomer({ name: '   ', phone: '' })).rejects.toBeInstanceOf(AppError);

    expect(create).not.toHaveBeenCalled();
  });
});

describe('deleteCustomer', () => {
  it('requires a session and then removes the row', async () => {
    remove.mockResolvedValue(undefined);

    await deleteCustomer('cus-1');

    expect(remove).toHaveBeenCalledWith('cus-1');
  });
});

describe('updateCustomer', () => {
  it('writes the new name and phone against the given id', async () => {
    update.mockResolvedValue(budi({ name: 'Budi' }));

    await updateCustomer('cus-1', { name: ' Budi ', phone: '' });

    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi', phone: '' },
      lastUsedAt: expect.any(String),
    });
  });
});

describe('rememberCustomer', () => {
  it('files a new customer under the signed-in owner', async () => {
    findByName.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    await rememberCustomer({ name: 'Budi Santoso', phone: '081234567890' });

    expect(findByName).toHaveBeenCalledWith('user-a', 'Budi Santoso');
    expect(create).toHaveBeenCalledWith({
      id: expect.any(String),
      ownerId: 'user-a',
      customer: { name: 'Budi Santoso', phone: '081234567890' },
      lastUsedAt: expect.any(String),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the existing row rather than adding a second one for the same person', async () => {
    // The incoming phone is written back as typed — folding it is only for the
    // identity key, so the printed invoice keeps the number the user gave.
    findByName.mockResolvedValue([budi()]);
    update.mockResolvedValue(budi());

    await rememberCustomer({ name: 'Budi Santoso', phone: '+62 812-3456-7890' });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi Santoso', phone: '+62 812-3456-7890' },
      lastUsedAt: expect.any(String),
    });
  });

  it('adds a second row when the same name belongs to a different number', async () => {
    findByName.mockResolvedValue([budi()]);
    create.mockResolvedValue(budi({ id: 'cus-2', phone: '081111111111' }));

    await rememberCustomer({ name: 'Budi Santoso', phone: '081111111111' });

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the invoice has no customer name yet', async () => {
    await expect(rememberCustomer({ name: '   ', phone: '0812' })).resolves.toBeNull();

    expect(findByName).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('stamps the invoice’s own timestamp so an older invoice cannot look newer', async () => {
    findByName.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    await rememberCustomer({ name: 'Budi', phone: '' }, '2026-01-05T00:00:00.000Z');

    expect(create.mock.calls[0]?.[0].lastUsedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(rememberCustomer({ name: 'Budi', phone: '' })).rejects.toBeInstanceOf(AppError);
  });
});
