import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { IslandBoundary } from '../ui/island-boundary';
import { ProfileForm } from '../profile/profile-form';
import { useProfile } from '../../../lib/query/hooks/use-profile';
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
  const { data: profile, isLoading, isError, refetch } = useProfile();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-title">Profil usaha</h1>
          <p className="mt-1 text-sm text-muted">
            Isi sekali, semua invoice otomatis memakai data ini.
          </p>
        </div>
      </header>

      <section className="rounded-card border border-border bg-card p-5 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted">Memuat profil…</p>
        ) : isError ? (
          // Never fall back to an empty form here: the user would see a blank
          // profile and saving would overwrite the real one with blanks.
          <ProfileLoadError onRetry={() => void refetch()} />
        ) : (
          <ProfileForm profile={profile ?? EMPTY_PROFILE} />
        )}
      </section>
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
