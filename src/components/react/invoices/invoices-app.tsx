import { Plus } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { PageHeader } from '../ui/page-header';
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
      <PageHeader
        title="Faktur"
        description="Semua invoice yang pernah kamu buat."
        actions={
          <>
            <ExportButtons
              filename="faktur-notain"
              sheetName="Faktur"
              getRows={async () => toInvoiceRows(await listAllInvoices())}
            />
            <Button onClick={() => window.location.assign('/invoice/new')}>
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
              Buat Invoice
            </Button>
          </>
        }
      />

      <InvoiceTable />
    </div>
  );
}
