import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { SignOutButton } from '../auth/sign-out-button';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { controlClass, useFieldIds } from '../ui/field';
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
} from '../../../lib/query/hooks/use-customers';
import { formatTanggalRelatif } from '../../../core/shared/dates';
import { toCustomerRows } from '../../../core/excel';
import { toAppError } from '../../../appwrite/errors';
import { ExportButtons } from '../excel/export-buttons';
import { CustomerImportPanel } from './customer-import';

/** The `/customers` island: the saved-customer directory, editable in place. */
export function CustomersApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <CustomersContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function CustomersContent() {
  const { data: customers, isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const nameIds = useFieldIds();
  const phoneIds = useFieldIds();

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;

    createCustomer.mutate(
      { name: trimmed, phone: phone.trim() },
      {
        onSuccess: () => {
          setName('');
          setPhone('');
        },
        onError: (error) => {
          // A rejected draft (too long, blank name) is the user's to fix, so it
          // is surfaced inline rather than thrown away silently.
          window.alert(toAppError(error).message);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title">Customer</h1>
          <p className="mt-1 text-sm text-muted">
            Daftar customer yang pernah kamu buat invoice. Otomatis terisi tiap kali kamu simpan
            invoice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            filename="customer-notain"
            sheetName="Customer"
            getRows={() => toCustomerRows(customers ?? [])}
            disabled={!customers}
          />
          <SignOutButton />
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
        className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-card sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={nameIds.id} className="text-sm font-medium text-foreground">
            Nama <span className="text-danger">*</span>
          </label>
          <input
            id={nameIds.id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Budi Santoso"
            autoComplete="off"
            className={controlClass()}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={phoneIds.id} className="text-sm font-medium text-foreground">
            WhatsApp
          </label>
          <input
            id={phoneIds.id}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0812…"
            autoComplete="off"
            inputMode="tel"
            className={controlClass()}
          />
        </div>
        <Button
          type="submit"
          loading={createCustomer.isPending}
          disabled={name.trim() === ''}
          className="sm:w-auto"
        >
          <Plus size={16} aria-hidden="true" />
          Tambah
        </Button>
      </form>

      <CustomerImportPanel />

      {isLoading ? (
        <p className="text-sm text-muted">Memuat customer…</p>
      ) : !customers || customers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border py-12 text-center">
          <Users size={24} className="text-muted" aria-hidden="true" />
          <p className="font-medium">Belum ada customer</p>
          <p className="text-sm text-muted">Tambahkan lewat form di atas, atau simpan invoice.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card shadow-card">
          {customers.map((customer) => (
            <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer.name}</p>
                <p className="text-sm text-muted">{customer.phone || 'Tanpa nomor'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-muted sm:inline">
                  {customer.lastUsedAt ? formatTanggalRelatif(customer.lastUsedAt) : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={deleteCustomer.isPending && deleteCustomer.variables === customer.id}
                  onClick={() => deleteCustomer.mutate(customer.id)}
                  aria-label={`Hapus ${customer.name}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
