import { ID, Query } from 'appwrite';
import type { Customer, CustomerDraft } from '../core/customer/model';
import { APPWRITE } from '../appwrite/config';
import { getTables } from '../appwrite/client';
import { toAppError } from '../appwrite/errors';
import { ownerRowPermissions } from '../appwrite/permissions';
import { customerRowToDomain, customerToRowData, type CustomerRow } from '../appwrite/mappers';
import type { CustomerCreation } from '../core/stats/finance';
import type { CustomerRepository } from '../ports/customer-repository';

const PAGE_LIMIT = 100;

/** Same bound as the template repository — a ceiling, not a paging strategy. */
const MAX_PAGES = 10;

export class AppwriteCustomerRepository implements CustomerRepository {
  async listByOwner(ownerId: string): Promise<Customer[]> {
    const customers: Customer[] = [];
    let cursorAfter: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const queries = [
        Query.equal('ownerId', ownerId),
        Query.limit(PAGE_LIMIT),
        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
      ];

      try {
        const response = await getTables().listRows<CustomerRow>({
          databaseId: APPWRITE.databaseId,
          tableId: APPWRITE.customersTableId,
          queries,
        });

        customers.push(...response.rows.map(customerRowToDomain));

        const last = response.rows.at(-1);
        if (response.rows.length < PAGE_LIMIT || !last) break;
        cursorAfter = last.$id;
      } catch (error) {
        throw toAppError(error);
      }
    }

    // Sorted here rather than with `Query.orderAsc('name')`: ordering by a
    // column wants an index on it, and a few dozen customers are not worth
    // another index to maintain.
    return customers.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async listRecentCreations(ownerId: string, limit = 10): Promise<CustomerCreation[]> {
    try {
      const response = await getTables().listRows<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        queries: [
          Query.equal('ownerId', ownerId),
          // Name only: the activity feed labels the event and nothing else.
          // `$createdAt` is a system attribute, always returned alongside the
          // projection — no extra column to select or maintain.
          Query.select(['name']),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ],
      });
      return response.rows.map((row) => ({
        name: typeof row.name === 'string' ? row.name : '',
        createdAt: row.$createdAt,
      }));
    } catch (error) {
      throw toAppError(error);
    }
  }

  async countByOwner(ownerId: string): Promise<number> {
    try {
      // One row is enough: Appwrite reports how many rows the query matched in
      // `total`, independent of `limit`, so we never pull the directory itself.
      const response = await getTables().listRows<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        queries: [Query.equal('ownerId', ownerId), Query.limit(1)],
      });
      return response.total;
    } catch (error) {
      throw toAppError(error);
    }
  }

  async listPage(
    ownerId: string,
    options: { cursorAfter?: string; limit?: number } = {},
  ): Promise<{ rows: Customer[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
    try {
      const response = await getTables().listRows<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        queries: [
          Query.equal('ownerId', ownerId),
          Query.limit(limit),
          ...(options.cursorAfter ? [Query.cursorAfter(options.cursorAfter)] : []),
        ],
      });
      const rows = response.rows
        .map(customerRowToDomain)
        .filter((customer) => customer.name.trim() !== '');
      const last = response.rows.at(-1);
      return {
        rows,
        nextCursor: response.rows.length === limit && last ? last.$id : null,
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async findByName(ownerId: string, name: string): Promise<Customer[]> {
    try {
      const response = await getTables().listRows<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        queries: [
          Query.equal('ownerId', ownerId),
          Query.equal('name', name),
          Query.limit(PAGE_LIMIT),
        ],
      });
      return response.rows.map(customerRowToDomain);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async create(input: {
    id: string;
    ownerId: string;
    customer: CustomerDraft;
    lastUsedAt: string;
  }): Promise<Customer> {
    try {
      const row = await getTables().createRow<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        rowId: input.id || ID.unique(),
        data: {
          ownerId: input.ownerId,
          ...customerToRowData(input.customer, input.lastUsedAt),
        },
        permissions: ownerRowPermissions(input.ownerId),
      });
      return customerRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async update(input: {
    id: string;
    customer: CustomerDraft;
    lastUsedAt: string;
  }): Promise<Customer> {
    try {
      const row = await getTables().updateRow<CustomerRow>({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        rowId: input.id,
        data: customerToRowData(input.customer, input.lastUsedAt),
      });
      return customerRowToDomain(row);
    } catch (error) {
      throw toAppError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await getTables().deleteRow({
        databaseId: APPWRITE.databaseId,
        tableId: APPWRITE.customersTableId,
        rowId: id,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw toAppError(error);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 404
  );
}
