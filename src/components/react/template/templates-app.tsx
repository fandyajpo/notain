import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card, EmptyCard } from '../ui/card';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { IslandBoundary } from '../ui/island-boundary';
import { useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
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
  const [query, setQuery] = useState('');
  const searchIds = useFieldIds();

  // Client-side name filter over both grids (both lists are fully loaded).
  const filteredBuiltins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_TEMPLATES;
    return BUILTIN_TEMPLATES.filter((t) => t.name.toLowerCase().includes(q));
  }, [query]);
  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data ?? [];
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }, [data, query]);
  const nothingMatches = filteredBuiltins.length === 0 && filteredMine.length === 0;

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
      <PageHeader
        title="Template invoice"
        description="Atur urutan blok, warna, dan teks default sekali, dipakai tiap kali invoice baru dibuat."
        actions={
          <Button onClick={() => window.location.assign('/templates/new')}>
            <Plus size={16} aria-hidden="true" />
            Template baru
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-xs">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <label htmlFor={searchIds.id} className="sr-only">
          Cari template
        </label>
        <Input
          id={searchIds.id}
          type="search"
          value={query}
          placeholder="Cari template…"
          className="h-10 pr-3 pl-9"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        role="alertdialog"
        size="sm"
        ariaLabelledBy="delete-template-title"
        title={<span id="delete-template-title">Hapus template ini?</span>}
        actions={[
          { label: 'Batal', variant: 'secondary', onClick: () => setPendingDelete(null) },
          {
            label: 'Hapus',
            variant: 'danger',
            loading: remove.isPending,
            onClick: () => pendingDelete && confirmDelete(pendingDelete),
          },
        ]}
      >
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">“{pendingDelete?.name}”</span> akan dihapus.
          Invoice yang sudah memakai template ini tetap tersimpan; tampilannya kembali ke template
          bawaan.
        </p>
      </Modal>

      {nothingMatches && !isLoading ? (
        <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
          Tidak ada template yang cocok.
        </Card>
      ) : null}

      {filteredBuiltins.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Bawaan</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBuiltins.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                logoUrl={logoUrl}
                business={profile}
                actions={
                  <Button
                    href={`/templates/new?from=${template.id}`}
                    variant="secondary"
                    size="sm"
                  >
                    <Copy size={13} aria-hidden="true" />
                    Duplikat
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Template saya</h2>

        {isLoading ? (
          <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
            Memuat template…
          </Card>
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
          <EmptyCard className="px-6">
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
          </EmptyCard>
        ) : filteredMine.length === 0 ? (
          <Card padding="none" className="px-6 py-10 text-center text-sm text-muted">
            Tidak ada template kamu yang cocok.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMine.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                logoUrl={logoUrl}
                business={profile}
                actions={
                  <>
                    <Button href={`/templates/${template.id}`} variant="secondary" size="sm">
                      <Pencil size={13} aria-hidden="true" />
                      Ubah
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPendingDelete(template)}
                      className="text-muted hover:border-danger/40 hover:text-danger"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Hapus
                    </Button>
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
