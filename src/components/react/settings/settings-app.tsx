import { useSyncExternalStore, type ReactNode } from 'react';
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
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { useSession } from '../../../lib/query/hooks/use-session';
import { usePageTour } from '../../../lib/tour/use-tour';
import { restartTour } from '../../../lib/tour/tour-manager';
import { EMPTY_PROFILE } from '../../../core/profile/model';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';

/**
 * Settings is TWO pages, not one:
 *
 * - `/settings` — **Profile Settings**: the person's own account (name,
 *   contact, logo) plus the welcome-tour replay card. Personal data, so it
 *   carries no organization permissions and no workspace state.
 * - `/settings/organization` — **Organization Settings**: the workspace
 *   (name, business type, members, public page, delete cascade). Everything
 *   here is scoped to the active org and its owner/member rules live in
 *   `OrgSection`.
 *
 * Both are thin shells over `AppProviders` + `AuthGate` — the same 4-layer
 * shell as every other page island — with the shared pieces (header,
 * error/loading states) kept identical so switching between the two reads as
 * one settings surface. Follows the `admin-app.tsx` convention of hosting
 * sibling page apps in one file.
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

/** Profile Settings — `/settings`. */
export function ProfileSettingsApp() {
  return (
    <SettingsShell>
      <ProfileSettingsContent />
    </SettingsShell>
  );
}

/** Organization Settings — `/settings/organization`. */
export function OrgSettingsApp() {
  return (
    <SettingsShell>
      <OrgSettingsContent />
    </SettingsShell>
  );
}

function ProfileSettingsContent() {
  usePageTour('settings');
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profil"
        description="Data pribadi kamu: nama, kontak, dan logo yang tampil di dokumen Notain."
        actions={
          <Button variant="secondary" size="sm" href="/settings/organization">
            Kelola organisasi
          </Button>
        }
      />

      {/* ── Profile ── Personal identity + contact fields only. The business
          name and type live on the organization (the Organization Settings
          page), never here. */}
      <section className="flex flex-col gap-4">
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
  const { data: orgs } = useOrgs();
  // The public page is addressed by the ORG id (its profile row id), not the
  // signed-in user — members of the same org all share the same `/site/<org>`.
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const org = orgs?.orgs.find((candidate) => candidate.id === orgId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organisasi"
        description="Nama usaha, anggota, dan ruang kerja tempat semua data Notain kamu tersimpan."
        actions={
          <Button variant="secondary" size="sm" href="/settings">
            Profil saya
          </Button>
        }
      />

      {/* ── Organization ── Workspace identity, people, public page, and the
          delete cascade. The `id` keeps the old `/settings#organisasi`
          anchor working on this route. */}
      <section id="organisasi" className="flex flex-col gap-4">
        <OrgSection />

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
      </section>
    </div>
  );
}
