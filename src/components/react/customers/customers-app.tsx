import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { Card, cardClass, EmptyCard } from '../ui/card';
import { PageHeader } from '../ui/page-header';
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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const nameIds = useFieldIds();
  const emailIds = useFieldIds();
  const phoneIds = useFieldIds();

  function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;

    createCustomer.mutate(
      { name: trimmed, email: email.trim(), phone: phone.trim() },
      {
        onSuccess: () => {
          setName('');
          setEmail('');
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
      <PageHeader
        title="Customer"
        description="Daftar customer yang pernah kamu buat invoice. Otomatis terisi tiap kali kamu simpan invoice."
        actions={
          <ExportButtons
            filename="customer-notain"
            sheetName="Customer"
            getRows={() => toCustomerRows(customers ?? [])}
            disabled={!customers}
          />
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAdd();
        }}
        className={cardClass('sm', 'flex flex-col gap-4 sm:flex-row sm:items-end')}
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
          <label htmlFor={emailIds.id} className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id={emailIds.id}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="budi@email.com"
            autoComplete="off"
            inputMode="email"
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
        <Card padding="none" className="px-4 py-10 text-center text-sm text-muted">
          Memuat customer…
        </Card>
      ) : !customers || customers.length === 0 ? (
        <EmptyCard>
          <Users size={24} className="mx-auto text-muted" aria-hidden="true" />
          <p className="mt-2 font-medium">Belum ada customer</p>
          <p className="mt-1 text-sm text-muted">
            Tambahkan lewat form di atas, atau simpan invoice.
          </p>
        </EmptyCard>
      ) : (
        <ul className={cardClass('none', 'flex flex-col divide-y divide-border')}>
          {customers.map((customer) => (
            <li key={customer.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer.name}</p>
                <p className="text-sm text-muted">
                  {[customer.email, customer.phone].filter(Boolean).join(' · ') ||
                    'Tanpa kontak'}
                </p>
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
