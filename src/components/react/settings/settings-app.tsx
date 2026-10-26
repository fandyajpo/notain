import { useSyncExternalStore } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { IslandBoundary } from '../ui/island-boundary';
import { ErrorState, LoadingState } from '../ui/state';
import { ProfileForm } from '../profile/profile-form';
import { OrgSection } from './org-section';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useSession } from '../../../lib/query/hooks/use-session';
import { usePageTour } from '../../../lib/tour/use-tour';
import { restartTour } from '../../../lib/tour/tour-manager';
import { EMPTY_PROFILE } from '../../../core/profile/model';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';

export function SettingsApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <SettingsContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function SettingsContent() {
  usePageTour('settings');
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const { data: session } = useSession();
  // The public page is addressed by the ORG id (its profile row id), not the
  // signed-in user — members of the same org all share the same `/site/<org>`.
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pengaturan" description="Kelola profil usaha, organisasi, dan tim kamu." />

      {/* ── Profile ── Personal identity + invoice data. The business name
          is NOT here: it is the organization's name (next section), edited
          once and mirrored into the profile row server-side. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section">Profil</h2>
          <p className="text-sm text-muted">
            Data yang tampil di kop invoice dan halaman usaha publik kamu.
          </p>
        </div>

        <div data-tour="settings-profile">
          {isLoading ? (
            <LoadingState label="Memuat profil…" />
          ) : isError ? (
            // Never fall back to an empty form here: the user would see a blank
            // profile and saving would overwrite the real one with blanks.
            <ErrorState
              title="Profil tidak bisa dimuat"
              message="Isian kosong tidak ditampilkan supaya data yang tersimpan tidak tertimpa."
              action={
                <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                  Coba lagi
                </Button>
              }
            />
          ) : (
            <Card>
              <ProfileForm profile={profile ?? EMPTY_PROFILE} />
            </Card>
          )}
        </div>
      </section>

      {/* ── Organization ── Workspace identity, people, public page, and the
          delete cascade. Its `id` is the anchor the sidebar's "Kelola
          organisasi" menu entry points at. */}
      <section id="organisasi" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section">Organisasi</h2>
          <p className="text-sm text-muted">
            Nama usaha, anggota, dan ruang kerja tempat semua data Notain kamu tersimpan.
          </p>
        </div>

        <OrgSection />

        {profile?.businessName && orgId && (
          <Card>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Halaman usaha publik</p>
                <p className="text-sm text-muted">
                  Tampilannya mengikuti tipe usaha yang dipilih di profil kamu. Bagikan tautan ini
                  ke pelanggan untuk membuka halamannya.
                </p>
                <p className="mt-1 font-mono text-xs text-muted">/site/{orgId}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                href={`/site/${orgId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buka halaman
              </Button>
            </div>
          </Card>
        )}
      </section>

      <Card data-tour="settings-tour">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Butuh bantuan memulai?</p>
            <p className="text-sm text-muted">
              Putar ulang tur perkenalan kapan saja untuk mengingat fitur-fitur utama Notain.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void restartTour('welcome', { userId: session?.id })}
          >
            Putar ulang tur
          </Button>
        </div>
      </Card>
    </div>
  );
}
