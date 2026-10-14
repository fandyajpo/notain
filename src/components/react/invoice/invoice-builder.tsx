import { type AnyFieldApi, useForm } from '@tanstack/react-form';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { useDebouncer } from '@tanstack/react-pacer';
import { useSelector } from '@tanstack/react-store';
import { Check, FileDown, Keyboard, LayoutTemplate, MessageCircle, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import {
  createEmptyDraft,
  createItem,
  createItemId,
  createPickedItem,
  EMPTY_SECTIONS,
  INVOICE_LIMITS,
  type AdjustmentType,
  type InvoiceDraft,
} from '../../../core/invoice/model';
import { invoiceDraftSchema } from '../../../core/invoice/schema';
import { formatRupiah } from '../../../core/shared/money';
import { todayIsoDate, addDaysIsoDate } from '../../../core/shared/dates';
import { buildInvoiceWhatsAppMessage, buildWhatsAppUrl } from '../../../core/whatsapp';
import type { BusinessProfile } from '../../../core/profile/model';
import { toast } from '../../../lib/ui/toast';
import {
  builderUiStore,
  setBuilderSection,
  type BuilderSection,
} from '../../../lib/store/builder-ui';
import { clearDraft, readDraft, writeDraft } from '../../../lib/draft-storage';
import { openPrintView } from '../../../lib/print';
import { useCreateInvoice, useUpdateInvoice } from '../../../lib/query/hooks/use-invoices';
import { useRememberCustomer } from '../../../lib/query/hooks/use-customers';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { useSession } from '../../../lib/query/hooks/use-session';
import type { PickPayload } from '../../shared/contracts';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { FieldShell, controlClass, errorMessage, useFieldIds } from '../ui/field';
import { BuilderTabs } from './builder-tabs';
import { ItemsGrid } from './items-grid';
import { InvoicePreview } from './invoice-preview';
import { listSelectableTemplates, resolveTemplate } from '../../../core/template/resolve';
import { applyTemplateDefaults } from '../../../core/template/apply';
import { TemplateCard } from '../template/template-picker';
import { Picker } from './picker';
import { LazyRichEditor } from './lazy-rich-editor';
import { TotalsPanel } from './totals-panel';

const AUTOSAVE_WAIT = 600;

type Props = {
  /** Present when editing an existing invoice. */
  invoiceId?: string;
  initialDraft?: InvoiceDraft;
  /**
   * Template chosen on the `/invoice/new` picker step.
   *
   * Delivered as a prop rather than inside `initialDraft`: `buildDefaultDraft`
   * restores a locally autosaved draft in preference to `initialDraft`, so a
   * pick carried only by the latter would be silently dropped for anyone
   * already halfway through an invoice.
   */
  templateId?: string;
  /**
   * Whether a fresh invoice should pull back a locally autosaved draft.
   *
   * Duplicating turns this off: the builder treats a copy as a new invoice
   * (`invoiceId` unset), so without an explicit opt-out it would restore
   * whatever was last autosaved and quietly overwrite the duplicate's content.
   */
  restoreAutosave?: boolean;
  profile: BusinessProfile;
  logoUrl?: string | null;
};

type FormValues = InvoiceDraft;

function buildDefaultDraft(
  ownerId: string,
  invoiceId: string | undefined,
  initialDraft: InvoiceDraft | undefined,
  nextNumber: string,
  restoreAutosave: boolean,
): FormValues {
  // A fresh invoice restores the locally autosaved draft, if there is one.
  // The draft is scoped to `ownerId` so it cannot leak between accounts.
  if (!invoiceId && restoreAutosave) {
    const stored = readDraft(ownerId, invoiceId);
    if (stored) return stored;
  }

  if (initialDraft) return initialDraft;

  const date = todayIsoDate();
  return {
    ...createEmptyDraft(nextNumber, date),
    dueDate: addDaysIsoDate(date, 14),
    sections: { ...EMPTY_SECTIONS },
  };
}

export function InvoiceBuilder({
  invoiceId,
  initialDraft,
  templateId,
  restoreAutosave = true,
  profile,
  logoUrl,
}: Props) {
  const isEditing = Boolean(invoiceId);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  // Files the customer away alongside the invoice. Never awaited for the
  // redirect — a directory write is a convenience, not part of the save.
  const rememberCustomer = useRememberCustomer();
  // Saved templates ride alongside the built-ins when resolving the invoice's
  // `templateId`; a miss falls back to a builtin rather than blanking the page.
  const { data: savedTemplates } = useTemplates();
  // Mounted inside `AuthGate`, so the session is already resolved here. It
  // scopes the autosaved draft to this account (see `draft-storage.ts`).
  const { data: session } = useSession();
  const ownerId = session?.id ?? '';
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const restoredRef = useRef(false);
  // Re-entry guard for submit. `form.handleSubmit()` can be triggered faster
  // than the reactive state updates, so a ref closes the window a state check
  // would leave open. Printing hands off to another tab and needs none.
  const submitInFlight = useRef(false);
  // Set once a local draft has actually been written, so the header can say
  // so. New invoices only — an existing invoice is the server's truth, not a
  // local draft, so there is nothing to reassure about there.
  const [autosaved, setAutosaved] = useState(false);

  const defaultDraft = useMemo(() => {
    const base = buildDefaultDraft(
      ownerId,
      invoiceId,
      initialDraft,
      initialDraft?.invoiceNumber ?? 'INV-0000-001',
      restoreAutosave,
    );
    // The pick rides on top of whatever draft was restored, and fills only the
    // sections still empty — so a resumed draft keeps its prose.
    return templateId
      ? applyTemplateDefaults(base, resolveTemplate(templateId, savedTemplates))
      : base;
  }, [ownerId, invoiceId, initialDraft, templateId, savedTemplates]);

  // Declared before the form because `onSubmit` cancels it — see below.
  const autosave = useDebouncer(
    (draft: FormValues) => {
      if (!restoredRef.current) return;
      writeDraft(ownerId, invoiceId, draft);
      setAutosaved(true);
    },
    { wait: AUTOSAVE_WAIT },
  );

  const form = useForm({
    defaultValues: defaultDraft,
    validators: { onChange: invoiceDraftSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        if (isEditing) {
          await updateInvoice.mutateAsync({ id: invoiceId as string, draft: value });
        } else {
          await createInvoice.mutateAsync(value);
        }
        // A debounced autosave may still be pending. Letting it fire after
        // `clearDraft` would write the draft straight back, and the next visit
        // to /invoice/new would resurrect the invoice we just saved.
        autosave.cancel();
        clearDraft(ownerId, invoiceId);
        // Fire-and-forget: the directory is a convenience for the next picker,
        // so it must not delay or block the redirect.
        rememberCustomer.mutate({
          draft: { name: value.customerName, email: '', phone: value.customerPhone ?? '' },
        });
        toast('Invoice berhasil disimpan.', { variant: 'success' });
        window.location.assign('/dashboard');
      } catch (error) {
        const message =
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message: string }).message)
            : 'Invoice gagal disimpan. Coba lagi.';
        setSaveError(message);
        toast(message, { variant: 'error' });
      }
    },
  });

  // Live values shared with the preview and the mobile action bar.
  const values = useSelector(form.store, (state) => state.values);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const canSubmit = useSelector(form.store, (state) => state.canSubmit);
  const submissionAttempts = useSelector(form.store, (state) => state.submissionAttempts);
  // Which tab panel is on show, shared with BuilderTabs through the store.
  const activeSection = useSelector(builderUiStore, (state) => state.activeSection);

  const totals = useMemo(
    () =>
      calculateTotals({
        items: values.items,
        discount: values.discount,
        tax: values.tax,
      }),
    [values.items, values.discount, values.tax],
  );

  useEffect(() => {
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    // Only new invoices autosave; an existing invoice is the source of truth.
    if (!restoredRef.current || isEditing) return;
    autosave.maybeExecute(values);
  }, [values, autosave, isEditing]);

  useEffect(() => {
    // A failed submit can leave its error on a tab that is not showing. Jump
    // to the first section that has one, so no error stays hidden. Discount
    // and tax live in the always-visible Ringkasan panel and map to nothing,
    // so they never steal the tab.
    if (submissionAttempts === 0) return;
    for (const path of Object.keys(flattenErrors(form.state.errors))) {
      const section = sectionForError(path);
      if (section) {
        setBuilderSection(section);
        return;
      }
    }
  }, [submissionAttempts, form]);

  const submit = useCallback(() => {
    if (submitInFlight.current || isSubmitting) return;
    submitInFlight.current = true;
    void form.handleSubmit().finally(() => {
      submitInFlight.current = false;
    });
  }, [form, isSubmitting]);

  const addItem = useCallback(() => {
    const current = form.state.values.items;
    if (current.length >= INVOICE_LIMITS.maxItems) return;
    form.setFieldValue('items', [...current, createItem(createItemId())]);
  }, [form]);

  const onPick = useCallback(
    (pick: PickPayload) => {
      if (pick.kind === 'customer') {
        form.setFieldValue('customerName', pick.name);
        form.setFieldValue('customerPhone', pick.phone);
        return;
      }
      const current = form.state.values.items;
      if (current.length >= INVOICE_LIMITS.maxItems) return;
      form.setFieldValue('items', [...current, createPickedItem(createItemId(), pick)]);
    },
    [form],
  );

  /**
   * Opens the print view with the invoice exactly as it stands right now —
   * unsaved edits included.
   *
   * Fully synchronous on purpose: browsers grant a popup allowance to the
   * click itself, and it does not survive an `await`. The print page fetches
   * the profile and the template itself, so nothing is waited on here.
   */
  const openPrint = useCallback(() => {
    openPrintView(values);
  }, [values]);

  /**
   * Swaps the invoice onto another template without leaving the builder, so
   * nothing typed so far has to be re-entered. `applyTemplateDefaults` only
   * fills the prose sections that are still empty.
   */
  const switchTemplate = useCallback(
    (id: string) => {
      const template = resolveTemplate(id, savedTemplates);
      const next = applyTemplateDefaults(values, template);
      form.setFieldValue('templateId', next.templateId);
      form.setFieldValue('sections', next.sections);
      if (next.notes !== values.notes) form.setFieldValue('notes', next.notes);
      setShowTemplates(false);
      toast(`Template diganti ke ${template.name}.`, { variant: 'success' });
    },
    [form, savedTemplates, values],
  );

  const openWhatsApp = useCallback(() => {
    // A blank phone would open `wa.me/?text=…` — a chat with no one on the
    // other end, which reads as a broken button. Guard it and say why instead.
    if (!values.customerPhone?.trim()) {
      toast('Isi nomor WhatsApp customer dulu supaya invoice bisa dikirim.', {
        variant: 'error',
      });
      return;
    }
    const message = buildInvoiceWhatsAppMessage({
      customerName: values.customerName || 'Customer',
      invoiceNumber: values.invoiceNumber,
      businessName: profile.name || 'Bisnis kamu',
      total: totals.grandTotal,
    });
    window.open(buildWhatsAppUrl({ phone: values.customerPhone, message }), '_blank', 'noopener');
  }, [
    profile.name,
    totals.grandTotal,
    values.customerName,
    values.customerPhone,
    values.invoiceNumber,
  ]);

  useHotkeys(
    [
      { hotkey: 'Mod+S', callback: () => submit(), options: { preventDefault: true } },
      { hotkey: 'Mod+Enter', callback: () => addItem(), options: { preventDefault: true } },
      {
        hotkey: 'Mod+Shift+P',
        callback: openPrint,
        options: { preventDefault: true },
      },
    ],
    { enabled: !isSubmitting },
  );

  return (
    <div className="flex flex-col gap-8 pb-32 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 lg:pb-0">
      <form
        id="invoice-form"
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isEditing ? 'Ubah Invoice' : 'Buat Invoice'}
            </h1>
            <button
              type="button"
              onClick={() => window.open('/#pintasan', '_blank')}
              className="hidden items-center gap-1.5 rounded-control border border-border bg-card px-2.5 py-1.5 text-xs text-muted shadow-card transition-colors hover:text-foreground focus-ring lg:inline-flex"
              title="Pintasan keyboard"
            >
              <Keyboard size={14} aria-hidden="true" />
              Mod+S simpan
            </button>
          </div>
          <p className="text-sm text-muted">Isi customer dan barangnya, total dihitung otomatis.</p>
          {autosaved && (
            <p role="status" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted">
              <Check size={13} className="text-accent" aria-hidden="true" />
              Tersimpan otomatis sebagai draft di perangkat ini; kerjaanmu aman sampai kamu simpan
              beneran.
            </p>
          )}
          <p className="mt-1 text-sm text-muted">
            Dari: <span className="font-medium text-foreground">{profile.name || '-'}</span> ·{' '}
            <a href="/settings" className="underline underline-offset-2 hover:text-foreground">
              Ubah profil
            </a>
          </p>
        </header>

        {saveError && (
          <p
            role="alert"
            className="rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          >
            {saveError}
          </p>
        )}

        <form.Subscribe selector={(state) => state.values.discount}>
          {(discount) => (
            <form.Subscribe selector={(state) => state.values.tax}>
              {(tax) => (
                <Section title="Ringkasan">
                  <TotalsPanel
                    items={values.items}
                    discount={discount}
                    tax={tax}
                    onDiscountChange={(adjustment) => form.setFieldValue('discount', adjustment)}
                    onTaxChange={(adjustment) => form.setFieldValue('tax', adjustment)}
                    errors={flattenErrors(submissionAttempts > 0 ? form.state.errors : [])}
                  />
                </Section>
              )}
            </form.Subscribe>
          )}
        </form.Subscribe>

        <BuilderTabs />

        <div hidden={activeSection !== 'detail'} className="flex flex-col gap-6">
          <Section title="Untuk siapa invoice ini?">
            <Picker
              mode="customer"
              label="Ambil customer dari riwayat"
              placeholder="Ketik nama customer…"
              onPick={onPick}
            />

            <form.Field name="customerName">
              {(field) => (
                <TextField
                  field={field}
                  label="Nama customer"
                  placeholder="Contoh: Budi"
                  required
                  showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                />
              )}
            </form.Field>

            <form.Field name="customerPhone">
              {(field) => (
                <TextField
                  field={field}
                  label="Nomor WhatsApp customer (opsional)"
                  placeholder="081234567890"
                  inputMode="tel"
                  hint="Dipakai untuk kirim invoice lewat WhatsApp."
                  showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                />
              )}
            </form.Field>
          </Section>

          <Section title="Detail invoice">
            <form.Field name="invoiceNumber">
              {(field) => (
                <TextField
                  field={field}
                  label="Nomor invoice"
                  placeholder="INV-2026-001"
                  required
                  readOnly={isEditing}
                  showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                />
              )}
            </form.Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <form.Field name="date">
                {(field) => (
                  <DateField
                    field={field}
                    label="Tanggal invoice"
                    required
                    showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                  />
                )}
              </form.Field>
              <form.Field name="dueDate">
                {(field) => (
                  <DateField
                    field={field}
                    label="Jatuh tempo (opsional)"
                    showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                  />
                )}
              </form.Field>
            </div>
          </Section>
        </div>

        <div hidden={activeSection !== 'barang'} className="flex flex-col gap-6">
          <Section title="Barang">
            <Picker
              mode="product"
              label="Tambah barang dari riwayat"
              placeholder="Ketik nama barang…"
              onPick={onPick}
            />
            <ItemsGrid
              items={values.items}
              onChange={(items) => form.setFieldValue('items', items)}
              errors={flattenErrors(submissionAttempts > 0 ? form.state.errors : [])}
            />
            <p className="text-xs text-muted">
              Tekan <kbd className="rounded border border-border bg-background px-1">Mod</kbd> +{' '}
              <kbd className="rounded border border-border bg-background px-1">Enter</kbd> untuk
              menambah barang.
            </p>
          </Section>
        </div>

        <div hidden={activeSection !== 'header'} className="flex flex-col gap-6">
          <Section title="Kop &amp; informasi invoice">
            <LazyRichEditor
              label="Bagian atas (di bawah kop)"
              value={values.sections.header}
              placeholder="Terima kasih sudah memesan…"
              onChange={(html) => form.setFieldValue('sections.header', html)}
            />
          </Section>
        </div>

        <div hidden={activeSection !== 'isi'} className="flex flex-col gap-6">
          <Section title="Bagian isi (di tengah)">
            <LazyRichEditor
              label="Keterangan tambahan"
              value={values.sections.content}
              placeholder="Ketentuan pengerjaan, estimasi waktu, dll."
              onChange={(html) => form.setFieldValue('sections.content', html)}
            />
          </Section>
        </div>

        <div hidden={activeSection !== 'footer'} className="flex flex-col gap-6">
          <Section title="Bagian bawah (footer)">
            <LazyRichEditor
              label="Info pembayaran &amp; tanda tangan"
              value={values.sections.footer}
              placeholder="Pembayaran: BCA 1234567890 a.n. …"
              onChange={(html) => form.setFieldValue('sections.footer', html)}
            />
          </Section>
        </div>

        <div hidden={activeSection !== 'catatan'} className="flex flex-col gap-6">
          <Section title="Catatan untuk customer">
            <form.Field name="notes">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="invoice-notes" className="text-sm font-medium text-foreground">
                    Catatan (opsional, mendukung Markdown)
                  </label>
                  <textarea
                    id="invoice-notes"
                    rows={3}
                    value={field.state.value ?? ''}
                    placeholder={
                      'Terima kasih sudah berbelanja 🙏\n\n**Pembayaran:** BCA 1234567890'
                    }
                    className={controlClass({ multiline: true })}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </Section>
        </div>

        <div className="hidden lg:block">
          <Button type="submit" full size="lg" loading={isSubmitting} disabled={!canSubmit}>
            <Save size={16} aria-hidden="true" />
            {isSubmitting ? 'Menyimpan…' : isEditing ? 'Simpan perubahan' : 'Simpan invoice'}
          </Button>
        </div>
      </form>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Preview invoice</p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              aria-expanded={showTemplates}
              onClick={() => setShowTemplates((open) => !open)}
              className="min-w-0"
            >
              <LayoutTemplate size={14} className="shrink-0" aria-hidden="true" />
              Template
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={openPrint}
              className="min-w-0 whitespace-normal text-left leading-tight"
            >
              <FileDown size={14} className="shrink-0" aria-hidden="true" />
              Cetak / Simpan PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={openWhatsApp}
              className="col-span-2 sm:col-span-1"
            >
              <MessageCircle size={14} aria-hidden="true" />
              WhatsApp
            </Button>
          </div>
        </div>
        {showTemplates && (
          <div className="grid grid-cols-2 gap-3" data-template-switcher>
            {listSelectableTemplates(savedTemplates ?? []).map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                logoUrl={logoUrl}
                business={profile}
                selected={template.id === values.templateId}
                onPick={switchTemplate}
              />
            ))}
          </div>
        )}
        <InvoicePreview
          business={profile}
          invoice={values}
          template={resolveTemplate(values.templateId, savedTemplates)}
          logoUrl={logoUrl}
        />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs text-muted">Total</p>
            <p className="text-base font-semibold tabular-nums">
              {formatRupiah(totals.grandTotal)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={openPrint}>
              Cetak / PDF
            </Button>
            <Button type="submit" form="invoice-form" loading={isSubmitting}>
              {isEditing ? 'Simpan' : 'Simpan invoice'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function shouldShow(submissionAttempts: number, isBlurred: boolean): boolean {
  return submissionAttempts > 0 || isBlurred;
}

type TextFieldProps = {
  field: AnyFieldApi;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
  inputMode?: 'tel' | 'text' | 'numeric';
  showError: boolean;
};

function TextField({
  field,
  label,
  placeholder,
  hint,
  required = false,
  readOnly = false,
  inputMode = 'text',
  showError,
}: TextFieldProps) {
  const { id } = useFieldIds();
  const error = showError ? errorMessage(field.state.meta.errors[0]) : undefined;

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={field.state.value ?? ''}
        placeholder={placeholder}
        readOnly={readOnly}
        autoComplete="off"
        aria-invalid={error ? 'true' : undefined}
        className={controlClass({
          invalid: Boolean(error),
          className: `h-11 ${readOnly ? 'read-only:cursor-default read-only:bg-background' : ''}`,
        })}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  );
}

type DateFieldProps = {
  field: AnyFieldApi;
  label: string;
  required?: boolean;
  showError: boolean;
};

function DateField({ field, label, required = false, showError }: DateFieldProps) {
  const { id } = useFieldIds();
  const error = showError ? errorMessage(field.state.meta.errors[0]) : undefined;

  return (
    <FieldShell label={label} htmlFor={id} error={error} required={required}>
      <input
        id={id}
        type="date"
        value={field.state.value ?? ''}
        aria-invalid={error ? 'true' : undefined}
        className={controlClass({ invalid: Boolean(error) })}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  );
}

function flattenErrors(errors: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(errors)) return result;

  // A form-level Standard Schema validator reports one record per validator,
  // keyed by dotted issue path (`discount.value`, `items`, …).
  for (const entry of errors) {
    if (!entry || typeof entry !== 'object') continue;
    for (const [path, issues] of Object.entries(entry as Record<string, unknown>)) {
      if (path in result || !Array.isArray(issues)) continue;
      const [first] = issues;
      if (first && typeof first === 'object' && 'message' in first) {
        result[path] = String((first as { message: unknown }).message);
      }
    }
  }
  return result;
}

/** Which tab panel a validation-error path lives behind, if any. */
const SECTION_BY_ERROR_PATH: ReadonlyArray<readonly [prefix: string, section: BuilderSection]> = [
  ['customerName', 'detail'],
  ['customerPhone', 'detail'],
  ['invoiceNumber', 'detail'],
  ['date', 'detail'],
  ['dueDate', 'detail'],
  ['items', 'barang'],
  ['sections.header', 'header'],
  ['sections.content', 'isi'],
  ['sections.footer', 'footer'],
  ['notes', 'catatan'],
];

/**
 * Maps a dotted error path (`items[0].name`, `sections.header`, …) onto the
 * tab that shows it. Discount and tax live in the always-visible Ringkasan
 * panel and map to nothing, so they never force a tab switch.
 */
function sectionForError(path: string): BuilderSection | undefined {
  return SECTION_BY_ERROR_PATH.find(
    ([prefix]) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`),
  )?.[1];
}

export type { AdjustmentType };
