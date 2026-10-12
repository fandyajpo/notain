import { Plus } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { SignOutButton } from '../auth/sign-out-button';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { InvoiceTable } from '../dashboard/invoice-table';
import { ExportButtons } from '../excel/export-buttons';
import { listAllInvoices } from '../../../app/invoices';
import { toInvoiceRows } from '../../../core/excel';

/** The `/invoices` island: the full invoice history, moved off the dashboard. */
export function InvoicesApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <InvoicesContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function InvoicesContent() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title">Faktur</h1>
          <p className="mt-1 text-sm text-muted">Semua invoice yang pernah kamu buat.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButtons
            filename="faktur-notain"
            sheetName="Faktur"
            getRows={async () => toInvoiceRows(await listAllInvoices())}
          />
          <SignOutButton />
          <a
            href="/invoice/new"
            className="inline-flex h-11 items-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 focus-ring"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            Buat Invoice
          </a>
        </div>
      </header>

      <InvoiceTable />
    </div>
  );
}
