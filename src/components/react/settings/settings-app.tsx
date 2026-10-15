import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { IslandBoundary } from '../ui/island-boundary';
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Profil usaha"
        description="Isi sekali, semua invoice otomatis memakai data ini."
      />

      <Card data-tour="settings-profile">
        {isLoading ? (
          <p className="text-sm text-muted">Memuat profil…</p>
        ) : isError ? (
          // Never fall back to an empty form here: the user would see a blank
          // profile and saving would overwrite the real one with blanks.
          <ProfileLoadError onRetry={() => void refetch()} />
        ) : (
          <ProfileForm profile={profile ?? EMPTY_PROFILE} />
        )}
      </Card>

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

function ProfileLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-sm text-danger">
        Profil tidak bisa dimuat. Isian kosong tidak ditampilkan supaya data yang tersimpan tidak
        tertimpa.
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}
