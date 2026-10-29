import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { LoadMore } from '../ui/load-more';
import { Modal } from '../ui/modal';
import { PageHeader } from '../ui/page-header';
import { IslandBoundary } from '../ui/island-boundary';
import { SearchField } from '../ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { TemplateCard } from './template-picker';
import { toast } from '../../../lib/ui/toast';
import { useDeleteTemplate, useTemplatesPage } from '../../../lib/query/hooks/use-templates';
import { useAdminMembership } from '../../../lib/query/hooks/use-admin';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { getActiveOrgId } from '../../../app/active-org';
import { toBusinessIssuer } from '../../../core/business/issuer';
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
  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useTemplatesPage();
  const mine = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);
  const { data: profile } = useProfile();
  const { data: orgs } = useOrgs();
  const org = orgs?.orgs.find((candidate) => candidate.id === getActiveOrgId()) ?? null;
  const { data: isAdmin } = useAdminMembership();
  // Custom templates (own block order, colors, branding) are the Pro feature;
  // the server 402s every write, so the UI must say so BEFORE a save attempt.
  // Admins skip the gate server-side, so they skip the lock here too.
  const canCustomize = Boolean(isAdmin) || Boolean(org?.active);
  const issuer = toBusinessIssuer(profile, org);
  const logoUrl = profile?.logoUrl ?? null;
  const remove = useDeleteTemplate();
  const [pendingDelete, setPendingDelete] = useState<InvoiceTemplate | null>(null);
  const [query, setQuery] = useState('');

  // Client-side name filter over both grids (built-ins are in the bundle;
  // "Template saya" filters the pages loaded so far).
  const filteredBuiltins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_TEMPLATES;
    return BUILTIN_TEMPLATES.filter((t) => t.name.toLowerCase().includes(q));
  }, [query]);
  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mine;
    return mine.filter((t) => t.name.toLowerCase().includes(q));
  }, [mine, query]);
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Template invoice"
        description={
          canCustomize
            ? 'Atur urutan blok, warna, dan teks default sekali, dipakai tiap kali invoice baru dibuat.'
            : 'Plan gratis memakai template bawaan. Template kustom — urutan blok, warna, dan branding di setiap nota — adalah fitur Pro.'
        }
        actions={
          canCustomize ? (
            <Button onClick={() => window.location.assign('/templates/new')}>
              <Plus size={16} aria-hidden="true" />
              Template baru
            </Button>
          ) : (
            <Button
              href="/pricing"
              variant="secondary"
              title="Template kustom adalah fitur plan Pro"
            >
              Lihat plan Pro
            </Button>
          )
        }
      />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Cari template…"
        aria-label="Cari template"
      />

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

      {nothingMatches && !isLoading ? <EmptyState title="Tidak ada template yang cocok." /> : null}

      {filteredBuiltins.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-section">Bawaan</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBuiltins.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                logoUrl={logoUrl}
                business={issuer}
                actions={
                  canCustomize ? (
                    <Button
                      href={`/templates/new?from=${template.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      <Copy size={13} aria-hidden="true" />
                      Duplikat
                    </Button>
                  ) : (
                    <Button
                      href="/pricing"
                      variant="secondary"
                      size="sm"
                      title="Template kustom adalah fitur plan Pro"
                    >
                      <Copy size={13} aria-hidden="true" />
                      Duplikat (Pro)
                    </Button>
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-section">Template saya</h2>

        {isLoading ? (
          <LoadingState label="Memuat template…" />
        ) : isError ? (
          <ErrorState
            title="Template gagal dimuat"
            message="Coba lagi."
            action={
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                Coba lagi
              </Button>
            }
          />
        ) : mine.length === 0 ? (
          <EmptyState
            title="Belum ada template sendiri"
            description={
              canCustomize
                ? 'Duplikat salah satu template bawaan, lalu sesuaikan urutan blok dan warnanya.'
                : 'Template kustom adalah fitur Pro. Plan gratis memakai template bawaan — pilih langsung saat membuat invoice.'
            }
            action={
              canCustomize ? (
                <Button
                  variant="secondary"
                  onClick={() => window.location.assign('/templates/new')}
                >
                  <Plus size={16} aria-hidden="true" />
                  Template baru
                </Button>
              ) : (
                <Button href="/pricing" variant="secondary">
                  Lihat plan Pro
                </Button>
              )
            }
          />
        ) : filteredMine.length === 0 ? (
          <EmptyState title="Tidak ada template kamu yang cocok." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMine.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  logoUrl={logoUrl}
                  business={issuer}
                  actions={
                    <>
                      {canCustomize ? (
                        <Button href={`/templates/${template.id}`} variant="secondary" size="sm">
                          <Pencil size={13} aria-hidden="true" />
                          Ubah
                        </Button>
                      ) : (
                        <Button
                          href="/pricing"
                          variant="secondary"
                          size="sm"
                          title="Ubah template adalah fitur plan Pro"
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Ubah (Pro)
                        </Button>
                      )}
                      <Button
                        variant="danger-soft"
                        size="sm"
                        onClick={() => setPendingDelete(template)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Hapus
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
            <LoadMore
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={() => void fetchNextPage()}
            />
          </>
        )}
      </section>
    </div>
  );
}
