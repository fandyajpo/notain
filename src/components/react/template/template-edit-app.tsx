import { useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { ArrowLeft, Save } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { IslandBoundary } from '../ui/island-boundary';
import { controlClass, useFieldIds } from '../ui/field';
import { BlockList } from './block-list';
import { DefaultsForm } from './defaults-form';
import { ThemeForm } from './theme-form';
import { InvoicePreview } from '../invoice/invoice-preview';
import { toast } from '../../../lib/ui/toast';
import { templateEditorTargetFromLocation } from '../../../lib/edit-route';
import {
  useCreateTemplate,
  useTemplates,
  useUpdateTemplate,
} from '../../../lib/query/hooks/use-templates';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { createSampleInvoice, SAMPLE_BUSINESS } from '../../../core/invoice/sample';
import { invoiceTemplateSchema } from '../../../core/template/schema';
import { getBuiltinTemplate } from '../../../core/template/builtins';
import { createDefaultLayout, DEFAULT_THEME } from '../../../core/template/model';
import type { AuthoredTemplate, InvoiceTemplate } from '../../../core/template/model';
import { GENERIC_ERROR_MESSAGE, isAppError } from '../../../core/shared/errors';

const SAMPLE = createSampleInvoice();

const EMPTY_DEFAULTS = { header: '', content: '', footer: '' };

/** A blank template, optionally seeded from a built-in so it starts usable. */
function blankTemplate(seedId?: string | null): AuthoredTemplate {
  const seed = seedId ? getBuiltinTemplate(seedId) : undefined;
  return {
    name: seed ? `${seed.name} (salinan)` : 'Template baru',
    layout: seed ? seed.layout.map((block) => ({ ...block })) : createDefaultLayout(),
    theme: seed ? { ...seed.theme, wallpaper: { ...seed.theme.wallpaper } } : { ...DEFAULT_THEME },
    defaults: seed ? { ...seed.defaults } : { ...EMPTY_DEFAULTS },
  };
}

/** Copies a stored template into editable form state, never by reference. */
function authoredOf(template: InvoiceTemplate): AuthoredTemplate {
  return {
    name: template.name,
    layout: template.layout.map((block) => ({ ...block })),
    theme: { ...template.theme, wallpaper: { ...template.theme.wallpaper } },
    defaults: { ...template.defaults },
  };
}

/**
 * `/templates/new` and `/templates/<id>` — author a template: blocks, colours,
 * default prose. Both paths serve the same static shell, so which one the
 * address bar holds is what decides between a blank editor and an existing
 * template (see `templateEditorTargetFromLocation`); `/templates/edit`,
 * the link that predates them, still works.
 */
export function TemplateEditApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <TemplateEditContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function TemplateEditContent() {
  const { id, seedId } = templateEditorTargetFromLocation(window.location);
  const { data, isLoading, isError, refetch } = useTemplates();

  if (isLoading) {
    return <Message>Memuat template…</Message>;
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger-soft p-6"
      >
        <p className="text-sm font-medium text-danger">Template gagal dimuat. Coba lagi.</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const existing = id ? data?.find((template) => template.id === id) : undefined;
  if (id && !existing) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-card border border-border bg-card p-6">
        <p className="text-sm text-muted">Template ini tidak ditemukan atau sudah dihapus.</p>
        <BackButton />
      </div>
    );
  }

  return (
    <TemplateForm
      key={existing?.id ?? `seed-${seedId ?? 'blank'}`}
      existing={existing}
      seedId={seedId}
    />
  );
}

function TemplateForm({
  existing,
  seedId,
}: {
  existing?: InvoiceTemplate;
  seedId?: string | null;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const { data: profile } = useProfile();
  const { id: nameId } = useFieldIds();

  const form = useForm({
    defaultValues: existing ? authoredOf(existing) : blankTemplate(seedId),
    validators: { onSubmit: invoiceTemplateSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        if (existing) {
          await updateMutation.mutateAsync({ id: existing.id, template: value });
        } else {
          await createMutation.mutateAsync(value);
        }
        toast('Template disimpan.', { variant: 'success' });
        window.location.assign('/templates');
      } catch (error) {
        const message = isAppError(error) ? error.message : GENERIC_ERROR_MESSAGE;
        setSaveError(message);
        toast(message, { variant: 'error' });
      }
    },
  });

  const values = useSelector(form.store, (state) => state.values);
  const isSubmitting = useSelector(form.store, (state) => state.isSubmitting);
  const errors = useSelector(form.store, (state) => state.errors);
  const visibleCount = values.layout.filter((block) => block.visible).length;

  const preview: InvoiceTemplate = useMemo(
    () => ({
      id: existing?.id ?? 'draft',
      name: values.name,
      layout: values.layout,
      theme: values.theme,
      defaults: values.defaults,
      builtin: false,
    }),
    [existing, values.name, values.layout, values.theme, values.defaults],
  );

  const business = profile ?? SAMPLE_BUSINESS;

  return (
    <form
      className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <BackButton />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium text-foreground">
                Nama template
              </label>
              <input
                id={nameId}
                value={values.name}
                maxLength={128}
                onChange={(event) => form.setFieldValue('name', event.target.value)}
                className={controlClass({ className: 'h-11' })}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => window.location.assign('/templates')}>
                Batal
              </Button>
              <Button type="submit" loading={isSubmitting}>
                <Save size={16} aria-hidden="true" />
                Simpan template
              </Button>
            </div>
          </div>

          {(saveError || errors.length > 0) && <Problem>{saveProblem(saveError, errors)}</Problem>}
        </header>

        <Section
          title="Blok invoice"
          description="Seret barisnya, atau pakai tombol panah, untuk mengubah urutan."
        >
          <BlockList
            layout={values.layout}
            onChange={(layout) => form.setFieldValue('layout', layout)}
          />
        </Section>

        <Section title="Warna & gaya" description="Warna ini yang bikin template terasa beda.">
          <ThemeForm
            theme={values.theme}
            onChange={(theme) => form.setFieldValue('theme', theme)}
          />
        </Section>

        <Section
          title="Teks default"
          description="Ditulis ke invoice begitu template ini dipakai. Masih bisa diubah sesudahnya."
        >
          <DefaultsForm
            defaults={values.defaults}
            onChange={(defaults) => form.setFieldValue('defaults', defaults)}
          />
        </Section>
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Preview</p>
          <span className="text-xs text-muted">{visibleCount} blok tampil</span>
        </div>
        <InvoicePreview
          business={business}
          invoice={SAMPLE.draft}
          template={preview}
          logoUrl={business.logoUrl ?? null}
        />
      </aside>
    </form>
  );
}

function saveProblem(saveError: string | null, errors: readonly unknown[]): string {
  if (saveError) return saveError;
  const messages = errors.map((error) =>
    typeof error === 'string' ? error : GENERIC_ERROR_MESSAGE,
  );
  return messages.join(' ') || GENERIC_ERROR_MESSAGE;
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-control border border-danger/25 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
    >
      {children}
    </p>
  );
}

function BackButton() {
  return (
    <a
      href="/templates"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground focus-ring"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      Daftar template
    </a>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card p-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}
