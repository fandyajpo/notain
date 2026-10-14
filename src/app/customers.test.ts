import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';
import type { Customer } from '../core/customer/model';
import { AppError } from '../core/shared/errors';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { listByOwner, countByOwner, findByName, create, update, remove } = vi.hoisted(() => ({
  listByOwner: vi.fn(),
  countByOwner: vi.fn(),
  findByName: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: {
    auth: { getSession },
    customers: { listByOwner, countByOwner, findByName, create, update, remove },
  },
}));

const {
  countCustomers,
  createCustomer,
  deleteCustomer,
  importCustomers,
  listCustomers,
  rememberCustomer,
  updateCustomer,
} = await import('./customers');
const { forgetSession } = await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };

const budi = (over: Partial<Customer> = {}): Customer => ({
  id: 'cus-1',
  name: 'Budi Santoso',
  email: 'budi@mail.com',
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
  countByOwner.mockReset();
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

    await createCustomer({ name: '  Budi Santoso ', email: '', phone: ' 081234567890 ' });

    expect(create.mock.calls[0]?.[0].ownerId).toBe('user-a');
    expect(create.mock.calls[0]?.[0].customer).toEqual({
      name: 'Budi Santoso',
      email: '',
      phone: '081234567890',
    });
    expect(typeof create.mock.calls[0]?.[0].lastUsedAt).toBe('string');
  });

  it('rejects a blank name before it ever reaches storage', async () => {
    await expect(createCustomer({ name: '   ', email: '', phone: '' })).rejects.toBeInstanceOf(AppError);

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

    await updateCustomer('cus-1', { name: ' Budi ', email: '', phone: '' });

    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi', email: '', phone: '' },
      lastUsedAt: expect.any(String),
    });
  });
});

describe('rememberCustomer', () => {
  it('files a new customer under the signed-in owner', async () => {
    listByOwner.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    await rememberCustomer({ name: 'Budi Santoso', email: '', phone: '081234567890' });

    expect(listByOwner).toHaveBeenCalledWith('user-a');
    expect(create).toHaveBeenCalledWith({
      id: expect.any(String),
      ownerId: 'user-a',
      customer: { name: 'Budi Santoso', email: '', phone: '081234567890' },
      lastUsedAt: expect.any(String),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('updates the existing row when the phone matches (folded)', async () => {
    // Identity is email OR phone: the same person under a trunk prefix must
    // reuse the row. Merge keeps the stored phone, not the incoming one.
    listByOwner.mockResolvedValue([budi()]);
    update.mockResolvedValue(budi());

    await rememberCustomer({
      name: 'Budi Santoso',
      email: 'budi@mail.com',
      phone: '+62 812-3456-7890',
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi Santoso', email: 'budi@mail.com', phone: '081234567890' },
      lastUsedAt: expect.any(String),
    });
  });

  it('updates the existing row when the email matches even under a different name', async () => {
    // Merge keeps the stored name — the existing row's label wins.
    listByOwner.mockResolvedValue([budi()]);
    update.mockResolvedValue(budi());

    await rememberCustomer({ name: 'B. Santoso', email: 'budi@mail.com', phone: '' });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi Santoso', email: 'budi@mail.com', phone: '081234567890' },
      lastUsedAt: expect.any(String),
    });
  });

  it('fills an empty email on the existing row when the phone matches', async () => {
    // The existing row has a phone but no email; the incoming draft supplies
    // the email under the same phone. Merge keeps the stored phone and fills
    // the gap.
    listByOwner.mockResolvedValue([budi({ email: '' })]);
    update.mockResolvedValue(budi({ email: 'budi@mail.com' }));

    await rememberCustomer({ name: 'Budi', email: 'budi@mail.com', phone: '081234567890' });

    expect(update).toHaveBeenCalledWith({
      id: 'cus-1',
      customer: { name: 'Budi Santoso', email: 'budi@mail.com', phone: '081234567890' },
      lastUsedAt: expect.any(String),
    });
  });

  it('adds a second row when the email and phone both differ', async () => {
    listByOwner.mockResolvedValue([budi()]);
    create.mockResolvedValue(budi({ id: 'cus-2', email: '', phone: '081111111111' }));

    await rememberCustomer({ name: 'Budi Santoso', email: '', phone: '081111111111' });

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the invoice has no customer name yet', async () => {
    await expect(rememberCustomer({ name: '   ', email: '', phone: '0812' })).resolves.toBeNull();

    expect(listByOwner).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('stamps the invoice’s own timestamp so an older invoice cannot look newer', async () => {
    listByOwner.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    await rememberCustomer({ name: 'Budi', email: '', phone: '' }, '2026-01-05T00:00:00.000Z');

    expect(create.mock.calls[0]?.[0].lastUsedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(rememberCustomer({ name: 'Budi', email: '', phone: '' })).rejects.toBeInstanceOf(AppError);
  });
});

describe('countCustomers', () => {
  it('returns the owner’s row count without transferring the directory', async () => {
    countByOwner.mockResolvedValue(7);

    await expect(countCustomers()).resolves.toBe(7);
    expect(countByOwner).toHaveBeenCalledWith('user-a');
    expect(listByOwner).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(countCustomers()).rejects.toBeInstanceOf(AppError);
  });
});

describe('importCustomers', () => {
  it('loads the directory once and files each new customer', async () => {
    listByOwner.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    const result = await importCustomers([
      { name: 'Budi', email: '', phone: '081111111111' },
      { name: 'Siti', email: '', phone: '082222222222' },
    ]);

    expect(result.imported).toBe(2);
    // One directory read, no per-row server-side name search.
    expect(listByOwner).toHaveBeenCalledTimes(1);
    expect(findByName).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('updates a row that already exists instead of duplicating it', async () => {
    listByOwner.mockResolvedValue([budi({ name: 'Budi', email: '', phone: '081111111111' })]);
    update.mockResolvedValue(budi());

    const result = await importCustomers([{ name: 'Budi', email: '', phone: '081111111111' }]);

    expect(result.imported).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0].id).toBe('cus-1');
  });

  it('matches on folded phone, so `+62 811…` updates the `0811…` row', async () => {
    listByOwner.mockResolvedValue([budi({ name: 'Budi', email: '', phone: '081111111111' })]);
    update.mockResolvedValue(budi());

    await importCustomers([{ name: 'Budi', email: '', phone: '+62 811-1111-1111' }]);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('collapses duplicate rows in the file to a single write', async () => {
    listByOwner.mockResolvedValue([]);
    create.mockResolvedValue(budi());

    const result = await importCustomers([
      { name: 'Budi', email: '', phone: '081111111111' },
      { name: 'Budi', email: '', phone: '081111111111' },
    ]);

    expect(result.imported).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('skips blank names without touching storage', async () => {
    listByOwner.mockResolvedValue([]);

    const result = await importCustomers([{ name: '   ', email: '', phone: '081111111111' }]);

    expect(result.imported).toBe(0);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    getSession.mockResolvedValue(null);

    await expect(importCustomers([{ name: 'Budi', email: '', phone: '' }])).rejects.toBeInstanceOf(AppError);
  });
});
