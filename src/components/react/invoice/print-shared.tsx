import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { InvoicePreview } from './invoice-preview';
import type { BusinessIssuer } from '../../../core/business/issuer';
import type { InvoiceDraft } from '../../../core/invoice/model';
import type { InvoiceTemplate } from '../../../core/template/model';

/**
 * The pieces both `/invoice/print` modes render.
 *
 * Split out of `print-app.tsx` so the signed-in branch can be loaded on demand
 * without dragging the print page's shared chrome into the lazy chunk — or,
 * worse, forming a cycle back into the entry module.
 */
export function PrintToolbar({ children, backLabel }: { children: ReactNode; backLabel?: string }) {
  return (
    <div data-print-toolbar className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>{children}</div>
        <div className="flex shrink-0 items-center gap-2">
          {backLabel && (
            <Button variant="secondary" onClick={() => window.history.back()}>
              {backLabel}
            </Button>
          )}
          <Button onClick={() => window.print()}>Cetak / Simpan PDF</Button>
        </div>
      </div>
    </div>
  );
}

export function PrintSheet({
  business,
  invoice,
  template,
  logoUrl,
}: {
  business: BusinessIssuer;
  invoice: InvoiceDraft;
  template: InvoiceTemplate;
  logoUrl?: string;
}) {
  return (
    <div data-print-sheet className="mx-auto w-full max-w-[182mm] px-4 py-8 sm:px-0">
      <InvoicePreview
        business={business}
        invoice={invoice}
        template={template}
        businessType={template.businessType ?? business.businessType}
        logoUrl={logoUrl}
      />
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-5 text-center text-sm text-muted">
      {children}
    </div>
  );
}
