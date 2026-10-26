import { useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { ArrowLeft, Save } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { IslandBoundary } from '../ui/island-boundary';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { PageHeader } from '../ui/page-header';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
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
import { useOrgs, useSetOrgBusinessType } from '../../../lib/query/hooks/use-orgs';
import { getActiveOrgId } from '../../../app/active-org';
import { createSampleInvoice, SAMPLE_BUSINESS } from '../../../core/invoice/sample';
import { toBusinessIssuer } from '../../../core/business/issuer';
import { invoiceTemplateSchema } from '../../../core/template/schema';
import { defaultsForBusiness, seedTemplateForBusiness } from '../../../core/template/seed';
import type { AuthoredTemplate, InvoiceTemplate } from '../../../core/template/model';
import type { BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { isBusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { BusinessTypeField } from '../business/business-type-field';
import { BusinessTypeStep } from '../business/business-type-step';
import { GENERIC_ERROR_MESSAGE, isAppError } from '../../../core/shared/errors';

/** Copies a stored template into editable form state, never by reference. */
function authoredOf(template: InvoiceTemplate): AuthoredTemplate {
  return {
    name: template.name,
    layout: template.layout.map((block) => ({ ...block })),
    theme: { ...template.theme, wallpaper: { ...template.theme.wallpaper } },
    defaults: { ...template.defaults },
    businessType: template.businessType,
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
  const { isLoading: profileLoading } = useProfile();
  const { data: orgs } = useOrgs();
  const orgId = getActiveOrgId();
  const org = orgs?.orgs.find((candidate) => candidate.id === orgId) ?? null;
  const setOrgType = useSetOrgBusinessType(orgId ?? '');
  // `undefined` = the first-run step is still waiting; `null` = skipped.
  const [picked, setPicked] = useState<BusinessSubtypeSlug | null | undefined>(undefined);

  if (isLoading || profileLoading) {
    return <LoadingState label="Memuat template…" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Template gagal dimuat"
        message="Coba lagi."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  const existing = id ? data?.find((template) => template.id === id) : undefined;
  if (id && !existing) {
    return (
      <EmptyState
        title="Template ini tidak ditemukan atau sudah dihapus."
        action={<BackButton />}
      />
    );
  }

  // Every new template opens with the question: the pick seeds this editor
  // and, once the template is actually saved, preselects the next visit.
  // Editing an existing template never asks — its type is its own. The type
  // is the ORGANIZATION's, not the profile's.
  const profileType = isBusinessSubtypeSlug(org?.businessType ?? '')
    ? (org?.businessType as BusinessSubtypeSlug)
    : null;

  /**
   * Persists the step's answer into the ORGANIZATION after a successful
   * create — and only then. Called with the form's final business type, so
   * changing it inside the editor after the step wins over the step's pick.
   * Skips and identical remembered choices leave the org alone.
   */
  const persistStepPick = (finalType: BusinessSubtypeSlug | null) => {
    if (picked === undefined || picked === null || !orgId) return;
    if (profileType === finalType) return;
    void setOrgType.mutateAsync(finalType).catch(() =>
      toast('Pilihan belum tersimpan. Bisa diatur lagi di Settings.', {
        variant: 'error',
      }),
    );
  };

  if (!existing && picked === undefined) {
    return (
      <BusinessTypeStep
        value={profileType}
        onPick={(slug) => setPicked(slug)}
        onSkip={() => setPicked(null)}
      />
    );
  }

  const businessType = picked !== undefined ? picked : profileType;

  return (
    <TemplateForm
      key={existing?.id ?? `seed-${seedId ?? 'blank'}-${businessType ?? 'none'}`}
      existing={existing}
      seedId={seedId}
      businessType={businessType}
      onCreated={persistStepPick}
    />
  );
}

function TemplateForm({
  existing,
  seedId,
  businessType,
  onCreated,
}: {
  existing?: InvoiceTemplate;
  seedId?: string | null;
  businessType: BusinessSubtypeSlug | null;
  /** Runs after a successful *create* (never an update) with the saved type. */
  onCreated?: (type: BusinessSubtypeSlug | null) => void;
}) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const { data: profile } = useProfile();
  const { data: orgs } = useOrgs();
  const org = orgs?.orgs.find((candidate) => candidate.id === getActiveOrgId()) ?? null;
  const { id: nameId } = useFieldIds();

  const form = useForm({
    defaultValues: existing ? authoredOf(existing) : seedTemplateForBusiness(seedId, businessType),
    validators: { onSubmit: invoiceTemplateSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        if (existing) {
          await updateMutation.mutateAsync({ id: existing.id, template: value });
        } else {
          await createMutation.mutateAsync(value);
          // Fire-and-forget: the template is already safe on the server, and a
          // profile write that fails only means the next creation asks again.
          onCreated?.(value.businessType);
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
      businessType: values.businessType,
      builtin: false,
    }),
    [existing, values.name, values.layout, values.theme, values.defaults, values.businessType],
  );

  const business = profile || org ? toBusinessIssuer(profile, org) : SAMPLE_BUSINESS;
  const sample = useMemo(() => createSampleInvoice(new Date(), business), [business]);

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

          <PageHeader
            title={existing ? 'Edit template' : 'Template baru'}
            actions={
              <>
                <Button variant="secondary" onClick={() => window.location.assign('/templates')}>
                  Batal
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  <Save size={16} aria-hidden="true" />
                  Simpan template
                </Button>
              </>
            }
          />

          {(saveError || errors.length > 0) && (
            <Notice variant="danger">{saveProblem(saveError, errors)}</Notice>
          )}
        </header>

        <Card>
          <FieldShell label="Nama template" htmlFor={nameId}>
            <Input
              id={nameId}
              value={values.name}
              maxLength={128}
              onChange={(event) => form.setFieldValue('name', event.target.value)}
            />
          </FieldShell>
        </Card>

        <BusinessTypeField
          value={values.businessType}
          onChange={(slug) => {
            // Switching trades re-seeds "Teks default" with the new trade's
            // example prose — leaving it behind was the old (wrong) behaviour.
            // Name, colours and block arrangement stay: those are the user's.
            // Re-picking the same type touches nothing.
            if (slug === values.businessType) return;
            form.setFieldValue('businessType', slug);
            form.setFieldValue('defaults', defaultsForBusiness(slug));
          }}
        />

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
          <p className="text-eyebrow uppercase text-muted">Preview</p>
          <span className="text-xs text-muted">{visibleCount} blok tampil</span>
        </div>
        <InvoicePreview
          business={business}
          invoice={sample.draft}
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
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}
