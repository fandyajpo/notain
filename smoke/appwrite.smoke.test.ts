import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES } from '../src/core/shared/errors';
import { createSampleInvoice, SAMPLE_BUSINESS } from '../src/core/invoice/sample';
import { signIn, signOut, signUp } from '../src/app/auth';
import { getProfile, removeLogo, saveProfile, uploadLogo } from '../src/app/profile';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoicesPage,
  updateInvoice,
} from '../src/app/invoices';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../src/app/templates';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  rememberCustomer,
} from '../src/app/customers';
import {
  DEFAULT_THEME,
  createDefaultLayout,
  type AuthoredTemplate,
} from '../src/core/template/model';

const USER_A = {
  email: 'notain-smoke-a@example.test',
  password: 'NotainSmoke12345!',
  name: 'Notain Smoke A',
};
const USER_B = {
  email: 'notain-smoke-b@example.test',
  password: 'NotainSmoke12345!',
  name: 'Notain Smoke B',
};

type Credentials = typeof USER_A;

/** 1×1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pngFile(): File {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
  return new File([bytes], 'notain-smoke.png', { type: 'image/png' });
}

/** A complete, valid template payload — every required block, default theme. */
function authoredTemplate(name: string): AuthoredTemplate {
  return {
    name,
    layout: createDefaultLayout(),
    theme: { ...DEFAULT_THEME },
    defaults: { header: '<p>Kop dari template</p>', content: '', footer: '', notes: undefined },
    businessType: null,
  };
}

/**
 * First run registers the account; later runs reuse it. A failure of the
 * second attempt is rethrown because it means something is genuinely broken.
 */
async function ensureSignedIn(credentials: Credentials) {
  try {
    return await signUp(credentials);
  } catch (firstError) {
    try {
      return await signIn(credentials);
    } catch {
      throw firstError;
    }
  }
}

describe('notain x appwrite', () => {
  it('signs in the primary user', async () => {
    const user = await ensureSignedIn(USER_A);
    expect(user.email).toBe(USER_A.email);
    expect(user.id).toBeTruthy();
  });

  it('round-trips the business profile', async () => {
    await saveProfile(SAMPLE_BUSINESS);
    const profile = await getProfile();
    expect(profile).toMatchObject(SAMPLE_BUSINESS);
  });

  it('stores a publicly viewable logo, replaces it, and removes it again', async () => {
    const profile = await getProfile();
    if (!profile) throw new Error('Expected a saved profile.');

    const first = await uploadLogo(pngFile(), profile);
    expect(first.logoFileId).toBeTruthy();
    expect(first.logoUrl).toBeTruthy();

    // No cookie header here: this proves `read("any")` was applied to the file.
    const view = await fetch(first.logoUrl ?? '');
    expect(view.status).toBe(200);

    // Replacing must not strand the previous object in the bucket: the row
    // moves to the fresh key and the old one is deleted right after.
    const second = await uploadLogo(pngFile(), first);
    expect(second.logoFileId).toBeTruthy();
    expect(second.logoFileId).not.toBe(first.logoFileId);

    const replacedAway = await fetch(first.logoUrl ?? '');
    expect(replacedAway.status).toBe(404);
    const stillThere = await fetch(second.logoUrl ?? '');
    expect(stillThere.status).toBe(200);

    const removed = await removeLogo(second);
    expect(removed.logoFileId).toBeUndefined();

    const afterDelete = await fetch(second.logoUrl ?? '');
    expect(afterDelete.status).toBe(404);
  });

  it('creates, reads, lists, updates and deletes an invoice', async () => {
    const { draft } = createSampleInvoice();

    const created = await createInvoice(draft);
    expect(created.id).toBeTruthy();
    expect(created.invoiceNumber).toBe(draft.invoiceNumber);
    expect(created.ownerId).toBeTruthy();

    const fetched = await getInvoice(created.id);
    expect(fetched.customerName).toBe('Budi Santoso');
    expect(fetched.items).toHaveLength(3);
    expect(fetched.discount).toEqual({ type: 'percent', value: 5 });
    expect(fetched.sections.footer).toContain('BCA');

    const updated = await updateInvoice(created.id, {
      ...draft,
      customerName: 'Budi Santoso Diperbarui',
    });
    expect(updated.customerName).toBe('Budi Santoso Diperbarui');

    // Re-read after the update: if the row lost its permissions on update the
    // owner would no longer be able to fetch it.
    const afterUpdate = await getInvoice(created.id);
    expect(afterUpdate.customerName).toBe('Budi Santoso Diperbarui');

    const list = await listInvoicesPage({ search: 'Budi Santoso Diperbarui' });
    expect(list.items.map((invoice) => invoice.id)).toContain(created.id);

    await deleteInvoice(created.id);
    await expect(getInvoice(created.id)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it("hides the owner's invoices from a different signed-in user", async () => {
    const { draft } = createSampleInvoice();
    const mine = await createInvoice({ ...draft, customerName: 'Terkunci Untuk A' });

    try {
      await signOut();
      await ensureSignedIn(USER_B);

      await expect(getInvoice(mine.id)).rejects.toBeInstanceOf(AppError);

      const otherUsersList = await listInvoicesPage({ search: 'Terkunci Untuk A' });
      expect(otherUsersList.items.map((invoice) => invoice.id)).not.toContain(mine.id);
    } finally {
      await signOut();
      await ensureSignedIn(USER_A);
      await deleteInvoice(mine.id);
    }
  });

  it('creates, reads, lists, updates and deletes a template', async () => {
    const created = await createTemplate(authoredTemplate('Smoke Template A'));
    expect(created.id).toBeTruthy();
    expect(created.name).toBe('Smoke Template A');
    expect(created.builtin).toBe(false);

    const fetched = await getTemplate(created.id);
    expect(fetched.defaults.header).toBe('<p>Kop dari template</p>');
    expect(fetched.layout.length).toBeGreaterThan(0);

    // Narrow one block and repaint the wallpaper: the JSON columns have to
    // survive a round-trip, not just the scalar fields.
    const updated = await updateTemplate(created.id, {
      ...authoredTemplate('Smoke Template A'),
      layout: fetched.layout.map((block) => ({ ...block, width: 'narrow' })),
      theme: {
        ...fetched.theme,
        radius: 4,
        wallpaper: { kind: 'gradient', from: '#112233', to: '#ffffff', angle: 135 },
      },
    });
    expect(updated.layout.every((block) => block.width === 'narrow')).toBe(true);
    expect(updated.theme.wallpaper).toEqual({
      kind: 'gradient',
      from: '#112233',
      to: '#ffffff',
      angle: 135,
    });

    const afterUpdate = await getTemplate(created.id);
    expect(afterUpdate.theme.radius).toBe(4);
    expect(afterUpdate.layout.every((block) => block.width === 'narrow')).toBe(true);

    const list = await listTemplates();
    expect(list.map((template) => template.id)).toContain(created.id);

    await deleteTemplate(created.id);
    await expect(getTemplate(created.id)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it("hides the owner's templates from a different signed-in user", async () => {
    const mine = await createTemplate(authoredTemplate('Terkunci Untuk B'));

    try {
      await signOut();
      await ensureSignedIn(USER_B);

      await expect(getTemplate(mine.id)).rejects.toBeInstanceOf(AppError);
      expect((await listTemplates()).map((template) => template.id)).not.toContain(mine.id);
    } finally {
      await signOut();
      await ensureSignedIn(USER_A);
      await deleteTemplate(mine.id);
    }
  });

  it('keeps a templateId pointing at a template that round-tripped', async () => {
    const template = await createTemplate(authoredTemplate('Referensi Terpakai'));
    let invoiceId = '';
    try {
      const { draft } = createSampleInvoice();
      const saved = await createInvoice({ ...draft, templateId: template.id });
      invoiceId = saved.id;

      const fetched = await getInvoice(invoiceId);
      expect(fetched.templateId).toBe(template.id);

      const resolved = await getTemplate(fetched.templateId as string);
      expect(resolved.name).toBe('Referensi Terpakai');
    } finally {
      if (invoiceId) await deleteInvoice(invoiceId);
      await deleteTemplate(template.id);
    }
  });

  it('files a customer on invoice save and reuses the row the next time', async () => {
    // `rememberCustomer` is what the builder calls after every save. Running it
    // twice for the same person is the case that used to produce a duplicate
    // row per invoice.
    const first = await rememberCustomer({
      name: 'Smoke Budi',
      email: '',
      phone: '+62 812-3456-7890',
    });
    if (!first) throw new Error('rememberCustomer did not file the customer');

    try {
      const second = await rememberCustomer({
        name: 'Smoke Budi',
        email: '',
        // Same person, local trunk prefix — must not become a second entry.
        phone: '081234567890',
      });
      expect(second?.id).toBe(first.id);

      const listed = await listCustomers();
      const rows = listed.filter((customer) => customer.name === 'Smoke Budi');
      expect(rows).toHaveLength(1);
      // The stored phone is whatever was last typed, not the folded key.
      expect(rows[0]?.phone).toBe('081234567890');

      // A different number under the same name is a different person.
      const other = await rememberCustomer({
        name: 'Smoke Budi',
        email: '',
        phone: '081111111111',
      });
      if (!other) throw new Error('rememberCustomer did not file the second customer');
      expect(other.id).not.toBe(first.id);
      await deleteCustomer(other.id);
    } finally {
      await deleteCustomer(first.id);
    }

    expect((await listCustomers()).map((customer) => customer.name)).not.toContain('Smoke Budi');
  });

  it('records a customer without a phone and lists it', async () => {
    const created = await createCustomer({ name: 'Smoke Tanpa Nomor', email: '', phone: '' });

    try {
      expect(created.name).toBe('Smoke Tanpa Nomor');
      expect(created.phone).toBe('');
      expect((await listCustomers()).map((customer) => customer.id)).toContain(created.id);
    } finally {
      await deleteCustomer(created.id);
    }
  });

  it("hides the owner's customers from a different signed-in user", async () => {
    const mine = await createCustomer({ name: 'Smoke Terkunci', email: '', phone: '' });

    try {
      await signOut();
      await ensureSignedIn(USER_B);

      expect((await listCustomers()).map((customer) => customer.id)).not.toContain(mine.id);
    } finally {
      await signOut();
      await ensureSignedIn(USER_A);
      await deleteCustomer(mine.id);
    }
  });

  it('leaves no session behind', async () => {
    await signOut();
    await expect(getProfile()).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
    });
  });
});
