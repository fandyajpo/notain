import { type AnyFieldApi, useForm } from '@tanstack/react-form';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { useDebouncer } from '@tanstack/react-pacer';
import { useSelector } from '@tanstack/react-store';
import {
  Check,
  ExternalLink,
  FileDown,
  Keyboard,
  LayoutTemplate,
  MessageCircle,
  PackageSearch,
  PartyPopper,
  Save,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import {
  createEmptyDraft,
  createItem,
  createItemId,
  createPickedItem,
  EMPTY_SECTIONS,
  INVOICE_LIMITS,
  needsPaymentCheck,
  type AdjustmentType,
  type InvoiceDraft,
  type InvoicePaymentProof,
  type InvoiceStatus,
} from '../../../core/invoice/model';
import { invoiceDraftSchema } from '../../../core/invoice/schema';
import { formatRupiah } from '../../../core/shared/money';
import { todayIsoDate, addDaysIsoDate } from '../../../core/shared/dates';
import { buildInvoiceWhatsAppMessage, buildWhatsAppUrl } from '../../../core/whatsapp';
import type { BusinessProfile } from '../../../core/profile/model';
import { toast } from '../../../lib/ui/toast';
import { confettiBurst, confettiFromElement } from '../../../lib/ui/confetti';
import { cx } from '../../../lib/ui/classes';
import {
  builderUiStore,
  setBuilderSection,
  type BuilderSection,
} from '../../../lib/store/builder-ui';
import { clearDraft, readDraft, writeDraft } from '../../../lib/draft-storage';
import { openPrintView } from '../../../lib/print';
import {
  useCreateInvoice,
  useUpdateInvoice,
  useUpdateInvoiceStatus,
} from '../../../lib/query/hooks/use-invoices';
import { useRememberCustomer } from '../../../lib/query/hooks/use-customers';
import { useRememberCatalogItems } from '../../../lib/query/hooks/use-catalog';
import { useDeletePaymentProof } from '../../../lib/query/hooks/use-public-invoice';
import { usePageTour } from '../../../lib/tour/use-tour';
import { useUnsavedChangesGuard } from '../../../lib/use-unsaved-changes-guard';
import { toAppError } from '../../../appwrite/errors';
import { useTemplates } from '../../../lib/query/hooks/use-templates';
import { useSession } from '../../../lib/query/hooks/use-session';
import type { PickPayload } from '../../shared/contracts';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { FieldShell, errorMessage, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { Notice } from '../ui/notice';
import { StatusSelect } from '../ui/status-select';
import { setShortcutsOpen } from '../../../lib/store/shortcuts';
import { Textarea } from '../ui/textarea';
import { BuilderTabs } from './builder-tabs';
import { ItemsGrid } from './items-grid';
import { InvoicePreview } from './invoice-preview';
import {
  listSelectableTemplates,
  resolveTemplate,
  groupTemplatesForBusiness,
} from '../../../core/template/resolve';
import { applyTemplateDefaults } from '../../../core/template/apply';
import type { InvoiceTemplate } from '../../../core/template/model';
import type { BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import type { CatalogItem } from '../../../core/catalog/model';
import { getDetailFields } from '../../../core/business/detail-fields';
import { DetailFieldsCard } from './detail-fields-card';
import { TemplateCard } from '../template/template-picker';
import { Picker } from './picker';
import { CatalogPickerDialog } from './catalog-picker';
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
  /**
   * Whether saving this new invoice would be the account's very first
   * (no invoice numbers exist yet, and this is not a duplicate). Gates the
   * first-invoice celebration: a duplicate or a second invoice must never
   * trigger it, and a year rollover may read the list as empty — a "first of
   * the year" celebration is close enough to keep the detection this cheap.
   */
  firstInvoicePossible?: boolean;
  profile: BusinessProfile;
  logoUrl?: string | null;
  /**
   * The customer's uploaded payment proof, when editing a saved invoice.
   * Rendered as a notice above the status row so the owner sees a proof has
   * arrived without opening the dashboard — the upload itself happens on the
   * public print page, never here.
   */
  paymentProof?: InvoicePaymentProof | null;
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
  firstInvoicePossible = false,
  profile,
  logoUrl,
  paymentProof = null,
}: Props) {
  const isEditing = Boolean(invoiceId);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  // Status-only write, so flipping the lifecycle state from the edit page does
  // not have to round-trip the whole draft (rich-text sections included).
  const updateStatus = useUpdateInvoiceStatus();
  // Files the customer away alongside the invoice, awaited just before the
  // redirect (see `onSubmit` — unloading the page would abort it otherwise).
  const rememberCustomer = useRememberCustomer();
  // Files the invoice's ticked items into the catalog the same way: awaited so
  // the redirect does not abort it, and non-fatal like the customer write.
  const rememberCatalog = useRememberCatalogItems();
  // Saved templates ride alongside the built-ins when resolving the invoice's
  // `templateId`; a miss falls back to a builtin rather than blanking the page.
  const { data: savedTemplates } = useTemplates();
  // Mounted inside `AuthGate`, so the session is already resolved here. It
  // scopes the autosaved draft to this account (see `draft-storage.ts`).
  const { data: session } = useSession();
  const ownerId = session?.id ?? '';
  usePageTour('invoice-create');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  // The "Ambil dari katalog" dialog in the Barang tab.
  const [showCatalog, setShowCatalog] = useState(false);
  // The "Lunas!" bounce on the status row, and the first-invoice modal that
  // holds the redirect until the moment has been seen.
  const [paidPop, setPaidPop] = useState(false);
  const [firstInvoiceSaved, setFirstInvoiceSaved] = useState(false);
  // Owner-initiated proof removal: the confirm modal for the notice above the
  // status row. One-shot means a corrected screenshot starts with this delete.
  const [showProofDelete, setShowProofDelete] = useState(false);
  const deleteProof = useDeletePaymentProof();
  const statusRowRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  // Re-entry guard for submit. `form.handleSubmit()` can be triggered faster
  // than the reactive state updates, so a ref closes the window a state check
  // would leave open. Printing hands off to another tab and needs none.
  const submitInFlight = useRef(false);
  // Set once a local draft has actually been written, so the header can say
  // so. New invoices only — an existing invoice is the server's truth, not a
  // local draft, so there is nothing to reassure about there.
  const [autosaved, setAutosaved] = useState(false);
  // Latest `disarm` from the unsaved-changes guard. `onSubmit` is declared
  // before the form (and thus before the guard), so it reaches the live
  // function through this ref rather than a stale closure.
  const disarmGuard = useRef<() => void>(() => {});

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
      ? applyTemplateDefaults(
          base,
          resolveTemplate(templateId, savedTemplates),
          profile.businessType,
        )
      : base;
  }, [ownerId, invoiceId, initialDraft, templateId, savedTemplates, profile.businessType]);

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
        // Awaited, because `window.location.assign` below unloads the page and
        // would otherwise abort a mutation still in flight — the invoice would
        // save but the customer silently never land in the directory. It is
        // still non-fatal: a failed directory write must not fail the save, so
        // it only warns.
        try {
          await rememberCustomer.mutateAsync({
            draft: {
              name: value.customerName,
              email: value.customerEmail ?? '',
              phone: value.customerPhone ?? '',
            },
          });
        } catch {
          toast('Invoice tersimpan, tapi customer belum masuk ke daftar. Coba lagi nanti.', {
            variant: 'error',
          });
        }
        // Same best-effort treatment for the catalog: only the rows whose
        // "Simpan ke katalog" box is ticked (absent means ticked). A failure
        // here must never fail the save, so it only warns.
        try {
          const drafts = value.items
            .filter((item) => item.saveToCatalog !== false && item.name.trim() !== '')
            .map((item) => ({
              name: item.name.trim(),
              kind: 'barang' as const,
              unit: (item.unit ?? '').trim(),
              unitPrice: item.unitPrice,
            }));
          if (drafts.length > 0) await rememberCatalog.mutateAsync(drafts);
        } catch {
          toast('Invoice tersimpan, tapi sebagian barang belum masuk katalog. Coba lagi nanti.', {
            variant: 'error',
          });
        }
        // The very first invoice earns a celebration instead of the usual
        // instant redirect — the moment the whole onboarding builds up to
        // would otherwise flash past as a toast.
        if (!isEditing && firstInvoicePossible) {
          disarmGuard.current();
          setFirstInvoiceSaved(true);
          return;
        }
        toast('Invoice berhasil disimpan.', { variant: 'success' });
        // Disarm the unsaved-changes guard so this intentional redirect is not
        // met with a "leave?" prompt.
        disarmGuard.current();
        window.location.assign('/dashboard');
      } catch (error) {
        const message = toAppError(error).message;
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
  const isDirty = useSelector(form.store, (state) => state.isDirty);
  // Warn before leaving an edited invoice with unsaved changes. New invoices
  // autosave a local draft, so only the edit page needs the guard.
  const guard = useUnsavedChangesGuard(isDirty && isEditing);
  useEffect(() => {
    disarmGuard.current = guard.disarm;
  }, [guard.disarm]);

  const totals = useMemo(
    () =>
      calculateTotals({
        items: values.items,
        discount: values.discount,
        tax: values.tax,
      }),
    [values.items, values.discount, values.tax],
  );

  // The business type behind this invoice drives both the "Detail bisnis"
  // card and the rows the preview prints under the customer: the active
  // template's type first, the profile's as fallback for templates that never
  // picked one (built-ins, rows from before types existed).
  const activeTemplate = resolveTemplate(values.templateId, savedTemplates);
  const detailBusinessType = activeTemplate.businessType ?? profile.businessType;
  const detailFields = getDetailFields(detailBusinessType);

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

  /**
   * Flips the lifecycle status straight away (a status-only server write) and
   * mirrors it into the form so the select keeps showing the picked state.
   * The mirror is cosmetic now — a full "Simpan perubahan" never writes the
   * status column, so there is nothing for it to clobber. On failure the form
   * rolls back so the select does not claim a flip the server refused.
   */
  const changeStatus = useCallback(
    (status: InvoiceStatus) => {
      if (!invoiceId || status === values.status) return;
      const previous = values.status;
      form.setFieldValue('status', status);
      updateStatus
        .mutateAsync({ id: invoiceId, status })
        .then(() => {
          // Money in — celebrate only once the server has confirmed the flip,
          // never on the optimistic write.
          if (status !== 'paid') return;
          confettiFromElement(statusRowRef.current, { count: 30, distance: 100 });
          setPaidPop(true);
        })
        .catch(() => {
          form.setFieldValue('status', previous);
          toast('Status gagal disimpan. Coba lagi.', { variant: 'error' });
        });
    },
    [form, invoiceId, updateStatus, values.status],
  );

  // Clear the "Lunas" bounce once its animation has played out.
  useEffect(() => {
    if (!paidPop) return;
    const timer = window.setTimeout(() => setPaidPop(false), 600);
    return () => window.clearTimeout(timer);
  }, [paidPop]);

  useEffect(() => {
    if (!firstInvoiceSaved) return;
    confettiBurst(
      { x: window.innerWidth / 2, y: window.innerHeight * 0.35 },
      { count: 80, distance: 180 },
    );
  }, [firstInvoiceSaved]);

  const goToDashboard = useCallback(() => {
    window.location.assign('/dashboard');
  }, []);

  const addItem = useCallback(() => {
    const current = form.state.values.items;
    if (current.length >= INVOICE_LIMITS.maxItems) return;
    form.setFieldValue('items', [...current, createItem(createItemId())]);
  }, [form]);

  /** Appends one catalog entry as a new pre-filled item row. */
  const addFromCatalog = useCallback(
    (item: CatalogItem) => {
      const current = form.state.values.items;
      if (current.length >= INVOICE_LIMITS.maxItems) return;
      form.setFieldValue('items', [
        ...current,
        createPickedItem(createItemId(), {
          name: item.name,
          quantity: 1,
          unitPrice: item.unitPrice,
          ...(item.unit ? { unit: item.unit } : {}),
        }),
      ]);
    },
    [form],
  );

  const onPick = useCallback(
    (pick: PickPayload) => {
      if (pick.kind !== 'customer') return;
      form.setFieldValue('customerName', pick.name);
      form.setFieldValue('customerPhone', pick.phone);
      form.setFieldValue('customerEmail', pick.email);
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
      const next = applyTemplateDefaults(values, template, profile.businessType);
      form.setFieldValue('templateId', next.templateId);
      form.setFieldValue('sections', next.sections);
      if (next.notes !== values.notes) form.setFieldValue('notes', next.notes);
      setShowTemplates(false);
      toast(`Template diganti ke ${template.name}.`, { variant: 'success' });
    },
    [form, savedTemplates, values, profile.businessType],
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
    // Two columns from `md` up — below that a pair leaves the form unusably
    // narrow. Between `md` and `lg` there is no sidebar yet, so the whole
    // viewport is available; from `lg` on, the sidebar takes its cut. The
    // preview column stays deliberately narrower than the form: the document
    // scales to its column (`max-w-[182mm]`), so a slimmer preview is a
    // shorter one — less scrolling through the same invoice.
    <div className="flex flex-col gap-6 pb-32 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] md:items-start md:gap-6 md:pb-0 lg:gap-8">
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
            <h1 className="text-title">{isEditing ? 'Ubah Invoice' : 'Buat Invoice'}</h1>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="hidden rounded-control focus-ring lg:inline-flex"
              aria-haspopup="dialog"
              title="Pintasan keyboard"
            >
              <kbd className="inline-flex items-center gap-1.5 rounded-control border border-border bg-sunken px-2 py-0.5 text-eyebrow font-mono text-muted transition-colors hover:text-foreground">
                <Keyboard size={14} aria-hidden="true" />
                Pintasan
                <kbd className="rounded-control border border-border bg-background px-1 text-muted">
                  ?
                </kbd>
              </kbd>
            </button>
          </div>
          <p className="text-sm text-muted">Isi customer dan barangnya, total dihitung otomatis.</p>
          <p className="text-sm text-muted">
            Dari: <span className="font-medium text-foreground">{profile.name || '-'}</span> ·{' '}
            <a href="/settings" className="underline underline-offset-2 hover:text-foreground">
              Ubah profil
            </a>
          </p>
          {autosaved && (
            <p role="status" className="inline-flex w-fit items-center gap-1.5 text-xs text-muted">
              <Check size={13} className="text-accent" aria-hidden="true" />
              Tersimpan otomatis sebagai draft di perangkat ini; kerjaanmu aman sampai kamu simpan
              beneran.
            </p>
          )}
        </header>

        {saveError && <Notice variant="danger">{saveError}</Notice>}

        {isEditing && (
          <div
            ref={statusRowRef}
            className={cx('flex flex-col gap-2.5', paidPop && 'animate-paid-pop')}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm text-muted">Status</span>
              <StatusSelect
                size="lg"
                value={values.status}
                label={values.invoiceNumber}
                disabled={updateStatus.isPending}
                onChange={changeStatus}
              />
            </div>
            {paymentProof && (
              <Notice
                variant={
                  needsPaymentCheck({ status: values.status, paymentProof }) ? 'warning' : 'success'
                }
              >
                {needsPaymentCheck({ status: values.status, paymentProof }) ? (
                  <p>
                    Customer mengunggah bukti pembayaran. Periksa buktinya, lalu ubah status ke{' '}
                    <span className="font-medium">Lunas</span> kalau sudah cocok.
                  </p>
                ) : (
                  <p>Bukti pembayaran sudah diterima untuk invoice ini.</p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a
                    href={`/api/proof/${encodeURIComponent(paymentProof.key)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    Lihat bukti pembayaran
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowProofDelete(true)}
                    className="inline-flex items-center gap-1 font-medium text-danger underline underline-offset-2"
                  >
                    <Trash2 size={13} aria-hidden />
                    Hapus bukti
                  </button>
                </p>
              </Notice>
            )}
          </div>
        )}

        <form.Subscribe selector={(state) => state.values.discount}>
          {(discount) => (
            <form.Subscribe selector={(state) => state.values.tax}>
              {(tax) => (
                <Section title="Ringkasan" dataTour="inv-totals">
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

        <div data-tour="inv-tabs">
          <BuilderTabs />
        </div>

        <div hidden={activeSection !== 'detail'} className="flex flex-col gap-6">
          <Section title="Untuk siapa invoice ini?">
            <Picker
              mode="customer"
              label="Cari customer"
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

            <form.Field name="customerEmail">
              {(field) => (
                <TextField
                  field={field}
                  label="Email customer (opsional)"
                  placeholder="budi@email.com"
                  hint="Ikut tercetak di invoice dan ekspor Excel."
                  showError={shouldShow(submissionAttempts, field.state.meta.isBlurred)}
                />
              )}
            </form.Field>
          </Section>

          <DetailFieldsCard
            fields={detailFields}
            values={values.details}
            onChange={(details) => form.setFieldValue('details', details)}
          />

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
          <Section
            title="Barang"
            action={
              <Button size="sm" variant="secondary" onClick={() => setShowCatalog(true)}>
                <PackageSearch size={15} aria-hidden="true" />
                Ambil dari katalog
              </Button>
            }
          >
            <ItemsGrid
              items={values.items}
              onChange={(items) => form.setFieldValue('items', items)}
              errors={flattenErrors(submissionAttempts > 0 ? form.state.errors : [])}
            />
            <p className="text-xs text-muted">
              Tekan{' '}
              <kbd className="rounded-control border border-border bg-sunken px-1.5 py-0.5 font-mono">
                Mod
              </kbd>{' '}
              +{' '}
              <kbd className="rounded-control border border-border bg-sunken px-1.5 py-0.5 font-mono">
                Enter
              </kbd>{' '}
              untuk menambah barang. Centang "Simpan ke katalog" di tiap barang untuk memakainya
              ulang di invoice berikutnya.
            </p>
          </Section>
        </div>

        <div hidden={activeSection !== 'header'} className="flex flex-col gap-6">
          <Section title="Kop &amp; informasi invoice">
            {/* Mounted only while the tab is open: the editor chunk is by far
                the largest in the build, and hidden panels have no reason to
                fetch it on every page load. */}
            {activeSection === 'header' && (
              <LazyRichEditor
                label="Bagian atas (di bawah kop)"
                value={values.sections.header}
                placeholder="Terima kasih sudah memesan…"
                onChange={(html) => form.setFieldValue('sections.header', html)}
              />
            )}
          </Section>
        </div>

        <div hidden={activeSection !== 'isi'} className="flex flex-col gap-6">
          <Section title="Bagian isi (di tengah)">
            {activeSection === 'isi' && (
              <LazyRichEditor
                label="Keterangan tambahan"
                value={values.sections.content}
                placeholder="Ketentuan pengerjaan, estimasi waktu, dll."
                onChange={(html) => form.setFieldValue('sections.content', html)}
              />
            )}
          </Section>
        </div>

        <div hidden={activeSection !== 'footer'} className="flex flex-col gap-6">
          <Section title="Bagian bawah (footer)">
            {activeSection === 'footer' && (
              <LazyRichEditor
                label="Info pembayaran &amp; tanda tangan"
                value={values.sections.footer}
                placeholder="Pembayaran: BCA 1234567890 a.n. …"
                onChange={(html) => form.setFieldValue('sections.footer', html)}
              />
            )}
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
                  <Textarea
                    id="invoice-notes"
                    rows={3}
                    value={field.state.value ?? ''}
                    placeholder={
                      'Terima kasih sudah berbelanja 🙏\n\n**Pembayaran:** BCA 1234567890'
                    }
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </form.Field>
          </Section>
        </div>

        <div className="hidden md:block">
          <Button type="submit" full size="lg" loading={isSubmitting} disabled={!canSubmit}>
            <Save size={16} aria-hidden="true" />
            {isSubmitting ? 'Menyimpan…' : isEditing ? 'Simpan perubahan' : 'Simpan invoice'}
          </Button>
        </div>
      </form>

      {/* Sticky under the tablet header (56px) until the desktop sidebar
          replaces it at `lg`, where the top offset can shrink. */}
      <aside
        data-tour="inv-preview"
        className="flex flex-col gap-3 md:sticky md:top-20 md:max-h-[calc(100vh-6.5rem)] md:overflow-y-auto lg:top-6 lg:max-h-[calc(100vh-3rem)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-eyebrow uppercase text-muted">Preview invoice</p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              aria-haspopup="dialog"
              onClick={() => setShowTemplates(true)}
              className="min-w-0"
            >
              <LayoutTemplate size={14} className="shrink-0" aria-hidden="true" />
              Template
            </Button>
            {/* Sharing tools are for a saved invoice: an unsaved draft cannot
                be printed or sent to anyone yet. The narrow `invoiceId` check
                (equivalent to `isEditing`) also gives the payment link its id. */}
            {invoiceId && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={openPrint}
                  className="min-w-0 whitespace-normal text-left leading-tight"
                >
                  <FileDown size={14} className="shrink-0" aria-hidden="true" />
                  Cetak / Simpan PDF
                </Button>
                {/* The capability URL the customer opens: the invoice plus the
                    one-shot payment-proof upload. New tab, so these editing
                    tools stay right where they are. */}
                <Button
                  size="sm"
                  variant="secondary"
                  href={`/invoice/print/${invoiceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 whitespace-normal text-left leading-tight"
                >
                  <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
                  Halaman bayar
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
              </>
            )}
          </div>
        </div>
        <Modal
          open={showTemplates}
          onClose={() => setShowTemplates(false)}
          title="Ganti template"
          size="xl"
          bodyClassName="max-h-[65dvh] overflow-y-auto px-5 py-4 sm:px-6"
        >
          <TemplateSwitcherGrid
            templates={listSelectableTemplates(savedTemplates ?? [])}
            businessType={profile.businessType}
            logoUrl={logoUrl}
            business={profile}
            selectedId={values.templateId}
            onPick={switchTemplate}
          />
        </Modal>
        <CatalogPickerDialog
          open={showCatalog}
          onClose={() => setShowCatalog(false)}
          onPick={addFromCatalog}
        />
        <Modal
          open={showProofDelete}
          onClose={() => setShowProofDelete(false)}
          role="alertdialog"
          size="sm"
          ariaLabelledBy="proof-delete-dialog-title"
          title={<span id="proof-delete-dialog-title">Hapus bukti pembayaran ini?</span>}
          actions={[
            { label: 'Batal', variant: 'secondary', onClick: () => setShowProofDelete(false) },
            {
              label: 'Hapus',
              variant: 'danger',
              loading: deleteProof.isPending,
              onClick: async () => {
                if (!paymentProof) return;
                try {
                  await deleteProof.mutateAsync(paymentProof.key);
                  toast('Bukti pembayaran dihapus. Customer bisa unggah ulang.', {
                    variant: 'success',
                  });
                } catch {
                  toast('Bukti pembayaran gagal dihapus. Coba lagi.', { variant: 'error' });
                } finally {
                  setShowProofDelete(false);
                }
              },
            },
          ]}
        >
          <p className="text-sm text-muted">
            Bukti pembayaran yang diunggah customer akan dihapus dari invoice ini. Setelah dihapus,
            customer bisa mengunggah bukti yang baru lewat halaman bayar.
          </p>
        </Modal>
        <InvoicePreview
          business={profile}
          invoice={values}
          template={activeTemplate}
          businessType={detailBusinessType}
          logoUrl={logoUrl}
        />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs text-muted">Total</p>
            <p className="text-base font-semibold tabular-nums">
              {formatRupiah(totals.grandTotal)}
            </p>
          </div>
          <div className="flex gap-2">
            {isEditing && (
              <Button size="sm" variant="secondary" onClick={openPrint}>
                Cetak / PDF
              </Button>
            )}
            <Button type="submit" form="invoice-form" loading={isSubmitting}>
              {isEditing ? 'Simpan' : 'Simpan invoice'}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={guard.isPrompting}
        onClose={guard.cancelLeave}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="leave-dialog-title"
        title={<span id="leave-dialog-title">Tinggalkan invoice ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: guard.cancelLeave },
          { label: 'Tetap tinggalkan', variant: 'danger', onClick: guard.confirmLeave },
        ]}
      >
        <p className="text-sm text-muted">
          Perubahanmu belum disimpan dan akan hilang kalau kamu pergi dari halaman ini.
        </p>
      </Modal>

      <Modal
        open={firstInvoiceSaved}
        onClose={goToDashboard}
        dismissible={false}
        size="md"
        actions={[{ label: 'Lanjut ke dashboard', onClick: goToDashboard }]}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
            <PartyPopper size={26} aria-hidden="true" />
          </span>
          <h2 className="text-section">Invoice pertama jadi! 🎉</h2>
          <p className="text-sm text-muted">
            {values.invoiceNumber} sudah tersimpan. Tinggal kirim ke customer lewat WhatsApp dari
            halaman invoice — statusnya bisa ditandai Lunas begitu dibayar.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function Section({
  title,
  action,
  dataTour,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  dataTour?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5" data-tour={dataTour}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-section">{title}</h2>
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
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        value={field.state.value ?? ''}
        placeholder={placeholder}
        readOnly={readOnly}
        autoComplete="off"
        invalid={Boolean(error)}
        aria-invalid={error ? 'true' : undefined}
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
      <Input
        id={id}
        type="date"
        value={field.state.value ?? ''}
        invalid={Boolean(error)}
        aria-invalid={error ? 'true' : undefined}
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
  ['customerEmail', 'detail'],
  ['invoiceNumber', 'detail'],
  ['date', 'detail'],
  ['dueDate', 'detail'],
  ['details', 'detail'],
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

/** The in-builder template grid, grouped the same way the picker step is. */
function TemplateSwitcherGrid({
  templates,
  businessType,
  logoUrl,
  business,
  selectedId,
  onPick,
}: {
  templates: readonly InvoiceTemplate[];
  businessType: BusinessSubtypeSlug | null;
  logoUrl?: string | null;
  business?: BusinessProfile | null;
  selectedId?: string;
  onPick: (templateId: string) => void;
}) {
  const { matching, others } = groupTemplatesForBusiness(templates, businessType);
  const grouped = matching.length > 0;

  const grid = (list: readonly InvoiceTemplate[]) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-template-switcher>
      {list.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          logoUrl={logoUrl}
          business={business}
          selected={template.id === selectedId}
          onPick={onPick}
        />
      ))}
    </div>
  );

  if (!grouped) return grid(templates);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-eyebrow uppercase text-muted">Sesuai bisnis kamu</h3>
        {grid(matching)}
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-eyebrow uppercase text-muted">Jenis lain</h3>
          {grid(others)}
        </section>
      )}
    </div>
  );
}

export type { AdjustmentType };
