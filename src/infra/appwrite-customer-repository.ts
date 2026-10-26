import type { Customer, CustomerDraft } from '../core/customer/model';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { toAppError } from '../appwrite/errors';
import { customerRowToDomain, customerToRowData, type CustomerRow } from '../appwrite/mappers';
import type { CustomerCreation } from '../core/stats/finance';
import { getActiveOrgId } from '../app/active-org';
import { createData, deleteData, listData, patchData } from '../app/data-api';
import type { CustomerRepository } from '../ports/customer-repository';

const PAGE_LIMIT = 100; // matches the server's customers maxLimit

/** Same bound as the template repository — a ceiling, not a paging strategy. */
const MAX_PAGES = 10;

/**
 * The organization's saved-customer directory.
 *
 * Since multi-tenancy every call goes through `/api/data/customers` behind
 * `requireOrg` — the `ownerId` arguments stay in the interface as
 * *createdBy* provenance, scoping is the gate-verified `orgId`.
 */
export class AppwriteCustomerRepository implements CustomerRepository {
  private org(): string {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Pilih organisasi dulu.');
    }
    return orgId;
  }

  async listByOwner(ownerId: string): Promise<Customer[]> {
    void ownerId;
    const customers: Customer[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      try {
        const result = await listData<CustomerRow>('customers', {
          orgId: this.org(),
          limit: PAGE_LIMIT,
          ...(cursorAfter ? { cursorAfter } : {}),
        });

        customers.push(...result.rows.map(customerRowToDomain));

        if (!result.nextCursor) break;
        cursorAfter = result.nextCursor;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than ordering server-side: the mapper hands us
    // display rows already, and a few dozen customers are not worth leaning
    // on an index order for the picker's list.
    return customers.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async listRecentCreations(ownerId: string, limit = 10): Promise<CustomerCreation[]> {
    void ownerId;
    try {
      const result = await listData<CustomerRow>('customers', {
        orgId: this.org(),
        // Name only: the activity feed labels the event and nothing else.
        // `$createdAt` is a system attribute, always returned alongside the
        // projection — no extra column to select or maintain.
        select: ['name'],
        orderDesc: ['$createdAt'],
        limit,
      });
      return result.rows.map((row) => ({
        name: typeof row.name === 'string' ? row.name : '',
        createdAt: String(row.$createdAt ?? ''),
      }));
    } catch (error) {
      throw toAppError(error);
    }
  }

  async countByOwner(ownerId: string): Promise<number> {
    void ownerId;
    try {
      // One row is enough: the response reports how many rows the query
      // matched in `total`, independent of `limit`, so we never pull the
      // directory itself.
      const result = await listData<CustomerRow>('customers', {
        orgId: this.org(),
        limit: 1,
      });
      return result.total;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listPage(
    ownerId: string,
    options: { cursorAfter?: string; limit?: number } = {},
  ): Promise<{ rows: Customer[]; nextCursor: string | null }> {
    void ownerId;
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    try {
      const result = await listData<CustomerRow>('customers', {
        orgId: this.org(),
        limit,
        ...(options.cursorAfter ? { cursorAfter: options.cursorAfter } : {}),
      });
      const rows = result.rows
        .map(customerRowToDomain)
        .filter((customer) => customer.name.trim() !== '');
      return { rows, nextCursor: result.nextCursor };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async findByName(ownerId: string, name: string): Promise<Customer[]> {
    void ownerId;
    try {
      const result = await listData<CustomerRow>('customers', {
        orgId: this.org(),
        eq: { name },
        limit: PAGE_LIMIT,
      });
      return result.rows.map(customerRowToDomain);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: {
    id?: string;
    ownerId: string;
    customer: CustomerDraft;
    lastUsedAt: string;
  }): Promise<Customer> {
    void input.ownerId; // stamped server-side from the session.
    try {
      const row = await createData<CustomerRow>(
        'customers',
        this.org(),
        customerToRowData(input.customer, input.lastUsedAt),
        input.id,
      );
      return customerRowToDomain(row);
    } catch (error) {
      throw error instanceof AppError ? error : toAppError(error);
    }
  }

  async update(input: {
    id: string;
    customer: CustomerDraft;
    lastUsedAt: string;
  }): Promise<Customer> {
    try {
      const row = await patchData<CustomerRow>(
        'customers',
        this.org(),
        input.id,
        customerToRowData(input.customer, input.lastUsedAt),
      );
      return customerRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await deleteData('customers', this.org(), id);
    } catch (error) {
      throw toAppError(error);
    }
  }
}
