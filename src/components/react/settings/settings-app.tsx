import { useSyncExternalStore, type ReactNode } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { UserProfileEditor } from '../profile/user-profile-editor';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { IslandBoundary } from '../ui/island-boundary';
import { PageHeader } from '../ui/page-header';
import { ErrorState } from '../ui/state';
import { OrgContactEditor } from './org-contact-editor';
import { OrgSection } from './org-section';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { useSession } from '../../../lib/query/hooks/use-session';
import { restartTour } from '../../../lib/tour/tour-manager';
import { usePageTour } from '../../../lib/tour/use-tour';

/**
 * Settings is TWO pages, each with its own identity:
 *
 * - `/settings` — **Kelola Profil**: the SHARED account identity (username +
 *   phone) plus the read-only login email. It applies across every
 *   organization the user belongs to and works even without one, because the
 *   endpoint is gated by the session, not by an organization.
 * - `/settings/organization` — **Kelola Organisasi**: the workspace (name,
 *   business type), its contact block (what invoices and the public page
 *   print), members, the public page link, and the delete cascade — all
 *   scoped to the active organization.
 *
 * Both are thin shells over `AppProviders` + `AuthGate` — the same shell as
 * every other page island — with the shared pieces (header, error/loading
 * states) kept identical so switching between the two reads as one settings
 * surface. Follows the `admin-app.tsx` convention of hosting sibling page
 * apps in one file.
 */
function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>{children}</AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

/** Kelola Profil — `/settings`. */
export function ProfileSettingsApp() {
  return (
    <SettingsShell>
      <ProfileSettingsContent />
    </SettingsShell>
  );
}

/** Kelola Organisasi — `/settings/organization`. */
export function OrgSettingsApp() {
  return (
    <SettingsShell>
      <OrgSettingsContent />
    </SettingsShell>
  );
}

function ProfileSettingsContent() {
  usePageTour('settings');
  const { data: session } = useSession();
  const { data: orgs } = useOrgs();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelola Profil"
        description="Nama dan nomor telepon akunmu. Kontak usaha yang tercetak di nota diatur di Pengaturan usaha."
        actions={
          orgs?.orgs.length ? (
            <Button variant="secondary" size="sm" href="/settings/organization">
              Pengaturan usaha
            </Button>
          ) : undefined
        }
      />

      {/* ── Identitas akun: the SHARED user profile, one per account. The
          login email is read-only (owned by the Appwrite account) and every
          organization field lives on the other page. */}
      <section className="flex flex-col gap-4">
        <div data-tour="settings-profile">
          <Card>
            <UserProfileEditor />
          </Card>
        </div>
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

function OrgSettingsContent() {
  const { data: orgs, isLoading, isError, refetch } = useOrgs();
  // The public page is addressed by the ORG id, not the signed-in user —
  // every member of the organization shares the same `/site/<org>`.
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const org = orgs?.orgs.find((candidate) => candidate.id === orgId) ?? null;

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-muted">Memuat organisasi…</p>
      </Card>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Organisasi gagal dimuat"
        message="Profil pribadi tetap tersedia di halaman Kelola Profil."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            Coba lagi
          </Button>
        }
      />
    );
  }
  if (!orgs?.orgs.length) return <ProfileSettingsContent />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengaturan usaha"
        description="Atur nama, kontak, anggota, dan data untuk usaha ini."
        actions={
          <Button variant="secondary" size="sm" href="/settings">
            Profil saya
          </Button>
        }
      />

      {/* ── The workspace: name, business type, members, and the delete
          cascade. The `id` keeps the old `/settings#organisasi` anchor
          working on this route. */}
      <section id="organisasi" className="flex flex-col gap-4">
        <OrgSection />

        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-medium">Kontak usaha</p>
              <p className="text-sm text-muted">
                Kontak ini tercetak di nota dan tampil di halaman usahamu. Kontak akunmu diatur
                terpisah.
              </p>
            </div>
            <OrgContactEditor />
          </div>
        </Card>
      </section>

      {org?.name && orgId && (
        <Card>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Halaman usaha publik</p>
              <p className="text-sm text-muted">
                Tampilannya mengikuti jenis bisnis organisasi ini. Bagikan tautan ini ke pelanggan
                untuk membuka halamannya.
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
    </div>
  );
}
