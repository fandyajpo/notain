import { useSyncExternalStore, type ReactNode } from 'react';
import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { ErrorState, LoadingState } from '../ui/state';
import { OrgSection } from './org-section';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { useSession } from '../../../lib/query/hooks/use-session';
import { usePageTour } from '../../../lib/tour/use-tour';
import { restartTour } from '../../../lib/tour/tour-manager';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';

/**
 * Settings is TWO pages, each with its own identity:
 *
 * - `/settings` — **Kelola Profil**: the SHARED account identity (username +
 *   phone) plus the read-only login email. It applies across every
 *   organization the account owns or joins and works even before any
 *   workspace exists (the endpoint is session-gated, not org-gated). What an
 *   invoice PRINTS — the letterhead (business name, logo, header/footer,
 *   contact block) — is org-scoped and edited in Kelola Organisasi.
 * - `/settings/organization` — **Kelola Organisasi**: the workspace (name,
 *   business type, letterhead + contact, members, public page, delete
 *   cascade), scoped to the active org with its owner/member rules in
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelola Profil"
        description="Identitas akun kamu — dipakai di semua organisasi. Kop surat yang tercetak di invoice diatur di Kelola Organisasi."
        actions={
          <Button variant="secondary" size="sm" href="/settings/organization">
            Kelola organisasi
          </Button>
        }
      />

      {/* ── Identitas akun: the SHARED user profile. No org data here — the
          login email is read-only (owned by the Appwrite account) and the
          letterhead is org-scoped. */}
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
  const { data: orgs } = useOrgs();
  // The per-org letterhead (kop surat + kontak) via the legacy profile
  // Function — member-editable and scoped to the active org by its gate.
  const { data: profile, isLoading, isError, refetch } = useProfile();
  // The public page is addressed by the ORG id (its profile row id), not the
  // signed-in user — members of the same org all share the same `/site/<org>`.
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const org = orgs?.orgs.find((candidate) => candidate.id === orgId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kelola Organisasi"
        description="Identitas usaha, kop surat invoice, anggota, dan ruang kerja tempat semua data Notain kamu tersimpan."
        actions={
          <Button variant="secondary" size="sm" href="/settings">
            Profil saya
          </Button>
        }
      />

      {/* ── Organization + letterhead: the workspace identity, the printed
          letterhead (per-org, NOT the account identity), people, and the
          delete cascade. The `id` keeps the old `/settings#organisasi`
          anchor working on this route. */}
      <section id="organisasi" className="flex flex-col gap-4">
        <OrgSection />

        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-medium">Kop surat invoice &amp; kontak usaha</p>
              <p className="text-sm text-muted">
                Yang tercetak di kop surat invoice organisasi ini — terpisah dari identitas akun di
                Kelola Profil.
              </p>
            </div>
            {isLoading ? (
              <LoadingState label="Memuat kop surat…" />
            ) : isError ? (
              // Never fall back to an empty form here: the user would see a blank
              // letterhead and saving would overwrite the real one with blanks.
              <ErrorState
                title="Kop surat tidak bisa dimuat"
                message="Isian kosong tidak ditampilkan supaya data yang tersimpan tidak tertimpa."
                action={
                  <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                    Coba lagi
                  </Button>
                }
              />
            ) : (
              <ProfileForm profile={profile ?? EMPTY_PROFILE} />
            )}
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
