import { lazy, Suspense, useMemo } from 'react';
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import { Globe } from 'lucide-react';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from '../ui/state';
import { usePublicSite } from '../../../lib/query/hooks/use-public-site';
import { siteIdFromLocation } from '../../../lib/edit-route';
import { industryForSubtype } from '../../../core/site/industries';
import { ERROR_CODES, isAppError } from '../../../core/shared/errors';
import type { SiteTemplateProps } from './site-shared';

/**
 * `/site/<ownerId>` — the public business page, one industry template per
 * business type.
 *
 * The id is read from the address bar (the Pages Function, or the dev
 * middleware, serves the shell without touching the URL), fetched unauthenticated
 * from `GET /api/site/<ownerId>`, and the stored `businessType` subtype picks
 * the template — so the selection persists with the existing profile editor:
 * whatever type is saved in settings is what this page renders, with no
 * second preference to keep in sync.
 *
 * Every template is a separate lazy chunk: a visitor downloads the shared
 * frame plus *their* industry's page, not all nine. The map below is the
 * single registry from industry id to template — adding an industry means one
 * entry here and one file under `./templates/`.
 */

const TEMPLATES: Record<string, LazyExoticComponent<ComponentType<SiteTemplateProps>>> = {
  catering: lazy(() => import('./templates/catering')),
  designer: lazy(() => import('./templates/designer')),
  developer: lazy(() => import('./templates/developer')),
  warung: lazy(() => import('./templates/warung')),
  'online-shop': lazy(() => import('./templates/online-shop')),
  freelancer: lazy(() => import('./templates/freelancer')),
  repair: lazy(() => import('./templates/repair')),
  salon: lazy(() => import('./templates/salon')),
  general: lazy(() => import('./templates/general')),
};

/** Centered full-viewport stage for the states before a template exists. */
function SiteStage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export function SiteApp() {
  const ownerId = useMemo(
    () =>
      typeof window === 'undefined'
        ? undefined
        : siteIdFromLocation({
            pathname: window.location.pathname,
            search: window.location.search,
          }),
    [],
  );

  return (
    <IslandBoundary>
      <AppProviders>
        {ownerId ? (
          <PublicSiteView ownerId={ownerId} />
        ) : (
          <SiteStage>
            <EmptyState
              icon={Globe}
              title="Tautan halaman usaha tidak lengkap"
              description="Alamat ini belum menyertakan ID usahanya. Buka kembali tautan lengkap yang dibagikan pemiliknya."
            />
          </SiteStage>
        )}
      </AppProviders>
    </IslandBoundary>
  );
}

/** The fetched page: load → error/404 → the industry template. */
function PublicSiteView({ ownerId }: { ownerId: string }) {
  const { data, isLoading, isError, error, refetch } = usePublicSite(ownerId);

  if (isLoading) {
    return (
      <SiteStage>
        <LoadingState label="Memuat halaman usaha…" />
      </SiteStage>
    );
  }

  if (isError || !data) {
    const notFound = isAppError(error) && error.code === ERROR_CODES.NOT_FOUND;
    return (
      <SiteStage>
        {notFound ? (
          <EmptyState
            icon={Globe}
            title="Halaman usaha tidak ditemukan"
            description="Tautan ini tidak menunjuk ke halaman yang ada. Minta tautan baru ke pemiliknya."
          />
        ) : (
          <ErrorState
            title="Gagal memuat halaman"
            message={
              isAppError(error) && error.message
                ? error.message
                : 'Periksa koneksi internet kamu, lalu muat ulang halaman.'
            }
            action={<Button onClick={() => void refetch()}>Coba lagi</Button>}
          />
        )}
      </SiteStage>
    );
  }

  const Template =
    TEMPLATES[industryForSubtype(data.site.businessType)] ?? TEMPLATES.general ?? null;
  if (!Template) return null;

  return (
    <Suspense
      fallback={
        <SiteStage>
          <LoadingState label="Menyiapkan halaman…" />
        </SiteStage>
      }
    >
      <Template site={data.site} items={data.items} />
    </Suspense>
  );
}
