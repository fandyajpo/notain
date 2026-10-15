import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { InvoiceBuilder } from './invoice-builder';
import { TemplatePicker } from '../template/template-picker';
import { useInvoice, useInvoiceNumbers } from '../../../lib/query/hooks/use-invoices';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { createEmptyDraft, duplicateDraft } from '../../../core/invoice/model';
import { nextInvoiceNumber } from '../../../core/invoice/numbering';
import { addDaysIsoDate, todayIsoDate } from '../../../core/shared/dates';
import { ERROR_CODES, isAppError } from '../../../core/shared/errors';
import { listSelectableTemplates } from '../../../core/template/resolve';
import { EMPTY_PROFILE } from '../../../core/profile/model';

/**
 * `/invoice/new` — pick a template, then create the invoice with the next free
 * number.
 *
 * `?from=<id>` switches into duplicate mode: the source invoice is fetched and
 * copied into a fresh draft (new number, new date, same content), and the
 * template step is skipped because the copy already carries the source's
 * template.
 */
export function InvoiceNewApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <InvoiceNewContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function readSourceId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const id = new URLSearchParams(window.location.search).get('from');
  return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : undefined;
}

function InvoiceNewContent() {
  const sourceId = useMemo(readSourceId, []);
  const profileQuery = useProfile();
  const numbersQuery = useInvoiceNumbers();
  const templatesQuery = useTemplates();
  const sourceQuery = useInvoice(sourceId);

  const { data: profile, isLoading: profileLoading, isError: profileError } = profileQuery;
  const { data: numbers, isLoading: numbersLoading, isError: numbersError } = numbersQuery;
  const { data: savedTemplates, isLoading: templatesLoading, isError: templatesError } =
    templatesQuery;
  const { data: source, isLoading: sourceLoading, isError: sourceError } = sourceQuery;
  // A failed setup query must stop here: proceeding with an empty profile or an
  // empty number list risks a blank letterhead or a duplicate invoice number.
  const setupFailed = profileError || numbersError || templatesError;
  // `null` means "not chosen yet"; a built-in id can be any string, so the
  // picker step is keyed on absence rather than on a falsy value.
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null);

  const duplicating = Boolean(sourceId);
  // A definitive 404 means the source invoice is gone — that is the EmptyState
  // below's case, not a connectivity failure worth a retry button.
  const sourceNotFound =
    isAppError(sourceQuery.error) && sourceQuery.error.code === ERROR_CODES.NOT_FOUND;

  const draft = useMemo(() => {
    const date = todayIsoDate();
    const nextNumber = nextInvoiceNumber(numbers ?? []);
    // A duplicate carries the source's content but gets a fresh identity.
    if (source) return duplicateDraft(source, nextNumber, date);
    return {
      ...createEmptyDraft(nextNumber, date),
      dueDate: addDaysIsoDate(date, 14),
    };
  }, [source, numbers]);

  if (profileLoading || numbersLoading || templatesLoading) {
    return <LoadingState label="Menyiapkan invoice…" />;
  }

  if (setupFailed) {
    // Never fall through to the builder with a blank profile or an empty
    // number list — that could produce a wrong number or letterhead.
    return (
      <ErrorState
        title="Gagal menyiapkan invoice"
        message="Periksa koneksi internet kamu, lalu coba lagi."
        action={
          <Button
            onClick={() => {
              void profileQuery.refetch();
              void numbersQuery.refetch();
              void templatesQuery.refetch();
            }}
          >
            Coba lagi
          </Button>
        }
      />
    );
  }

  if (duplicating && sourceLoading) {
    return <LoadingState label="Menyalin invoice…" />;
  }

  if (duplicating && sourceError && !source && !sourceNotFound) {
    // The fetch failed — that's a connectivity problem, not a missing invoice.
    return (
      <ErrorState
        title="Gagal menyalin invoice"
        message="Periksa koneksi internet kamu, lalu coba lagi."
        action={
          <Button loading={sourceQuery.isFetching} onClick={() => void sourceQuery.refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  if (duplicating && !source) {
    return (
      <EmptyState
        icon={FileText}
        title="Invoice tidak ditemukan"
        description="Invoice yang mau disalin ini mungkin sudah dihapus, atau kamu membuka tautan dari akun lain."
        action={<Button href="/invoice/new">Buat invoice baru</Button>}
      />
    );
  }

  // Duplicate mode skips the picker: the copy already knows its template.
  if (!duplicating && pickedTemplateId === null) {
    return (
      <TemplatePicker
        templates={listSelectableTemplates(savedTemplates ?? [])}
        logoUrl={profile?.logoUrl ?? null}
        business={profile}
        onPick={setPickedTemplateId}
      />
    );
  }

  return (
    <InvoiceBuilder
      templateId={duplicating ? source?.templateId : (pickedTemplateId ?? undefined)}
      initialDraft={draft}
      restoreAutosave={!duplicating}
      profile={profile ?? EMPTY_PROFILE}
      logoUrl={profile?.logoUrl ?? null}
    />
  );
}
