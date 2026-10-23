import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { IslandBoundary } from '../ui/island-boundary';
import { ErrorState, LoadingState } from '../ui/state';
import { ProfileForm } from '../profile/profile-form';
import { useProfile } from '../../../lib/query/hooks/use-profile';
import { useSession } from '../../../lib/query/hooks/use-session';
import { usePageTour } from '../../../lib/tour/use-tour';
import { restartTour } from '../../../lib/tour/tour-manager';
import { EMPTY_PROFILE } from '../../../core/profile/model';

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profil usaha"
        description="Isi sekali, semua invoice otomatis memakai data ini."
      />

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

      {profile?.businessName && session?.id && (
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Halaman usaha publik</p>
              <p className="text-sm text-muted">
                Tampilannya mengikuti tipe usaha yang dipilih di atas. Bagikan tautan ini ke
                pelanggan untuk membuka halamannya.
              </p>
              <p className="mt-1 font-mono text-xs text-muted">/site/{session.id}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              href={`/site/${session.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka halaman
            </Button>
          </div>
        </Card>
      )}

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
