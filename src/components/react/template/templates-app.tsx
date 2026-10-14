import { useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { IslandBoundary } from '../ui/island-boundary';
import { TemplateCard } from './template-picker';
import { toast } from '../../../lib/ui/toast';
import { useDeleteTemplate, useTemplates } from '../../../lib/query/hooks/use-templates';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { GENERIC_ERROR_MESSAGE, isAppError } from '../../../core/shared/errors';
import type { InvoiceTemplate } from '../../../core/template/model';

/** `/templates` — every template this account can pick, built-ins included. */
export function TemplatesApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <TemplatesContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function TemplatesContent() {
  const { data, isLoading, isError, refetch } = useTemplates();
  const { data: profile } = useProfile();
  const logoUrl = profile?.logoUrl ?? null;
  const remove = useDeleteTemplate();
  const [pendingDelete, setPendingDelete] = useState<InvoiceTemplate | null>(null);

  function confirmDelete(template: InvoiceTemplate) {
    setPendingDelete(null);
    remove.mutate(template.id, {
      onError: (error) => {
        const message = isAppError(error) ? error.message : GENERIC_ERROR_MESSAGE;
        toast(message, { variant: 'error' });
      },
      onSuccess: () => toast(`Template "${template.name}" dihapus.`, { variant: 'success' }),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title">Template invoice</h1>
          <p className="mt-1 text-sm text-muted">
            Atur urutan blok, warna, dan teks default sekali, dipakai tiap kali invoice baru
            dibuat.
          </p>
        </div>
        <Button onClick={() => window.location.assign('/templates/new')}>
          <Plus size={16} aria-hidden="true" />
          Template baru
        </Button>
      </header>

      {pendingDelete && (
        <div
          role="alertdialog"
          aria-labelledby="delete-template-title"
          className="flex flex-col gap-4 rounded-card border border-danger/25 bg-danger-soft p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="delete-template-title" className="text-base font-semibold text-danger">
              Hapus "{pendingDelete.name}"?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Invoice yang sudah memakai template ini tetap tersimpan; tampilannya kembali ke
              template bawaan.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingDelete(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              onClick={() => confirmDelete(pendingDelete)}
            >
              Hapus
            </Button>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Bawaan</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILTIN_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              logoUrl={logoUrl}
              business={profile}
              actions={
                <a
                  href={`/templates/new?from=${template.id}`}
                  className="inline-flex items-center gap-1.5 rounded-control border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-card transition-colors hover:border-accent/60 focus-ring"
                >
                  <Copy size={13} aria-hidden="true" />
                  Duplikat
                </a>
              }
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Template saya</h2>

        {isLoading ? (
          <div className="rounded-card border border-border bg-card p-10 text-center text-sm text-muted">
            Memuat template…
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-card border border-danger/25 bg-danger-soft p-6"
          >
            <p className="text-sm font-medium text-danger">Template gagal dimuat. Coba lagi.</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : !data?.length ? (
          <div className="rounded-card border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">Belum ada template sendiri</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Duplikat salah satu template bawaan, lalu sesuaikan urutan blok dan warnanya.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => window.location.assign('/templates/new')}>
                <Plus size={16} aria-hidden="true" />
                Template baru
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                logoUrl={logoUrl}
                business={profile}
                actions={
                  <>
                    <a
                      href={`/templates/${template.id}`}
                      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-card transition-colors hover:border-accent/60 focus-ring"
                    >
                      <Pencil size={13} aria-hidden="true" />
                      Ubah
                    </a>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(template)}
                      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-background px-3 py-2 text-xs font-medium text-muted shadow-card transition-colors hover:border-danger/40 hover:text-danger focus-ring"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Hapus
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
