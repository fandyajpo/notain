import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useUserIdentity } from '../../../lib/query/hooks/use-user-profile';
import { useCreateOrg, useOrgs } from '../../../lib/query/hooks/use-orgs';
import { isAppError } from '../../../core/shared/errors';
import { getActiveOrgId } from '../../../app/active-org';
import { renameOrg } from '../../../app/orgs';
import { saveUserIdentity } from '../../../app/user-profile';
import { queryKeys } from '../../../lib/query/keys';
import { Button } from '../ui/button';
import { useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Modal } from '../ui/modal';
import { scheduleTour } from '../../../lib/tour/tour-store';

/**
 * Two-step onboarding: personal name, then business name — in create mode
 * ONE submit also creates the organization the account is missing.
 *
 * Two mounts, one shape:
 *
 * - **Normal** — AuthGate renders it when the person's name is missing OR the
 *   active org has no name; completion saves the profile and, if the business
 *   name changed, renames the organization, then AuthGate re-renders and
 *   mounts the dashboard children for the first time.
 * - **Create** (`createOrg`) — OrgGate renders it instead of a bare "make an
 *   organization" card when the account has zero orgs. The business name IS
 *   the workspace: the second step's submit creates the org named after it,
 *   then writes the personal profile — one flow, not two screens asking
 *   overlapping questions.
 *
 * `orgCreated` makes the create step run at most once: if the org was made
 *   but the profile write failed, retrying `Selesai` must save the profile
 *   only — never mint a second org with the same name.
 */
export function OnboardingModal({ createOrg = false }: { createOrg?: boolean }) {
  const createMode = createOrg;
  // No org yet → no profile row to read; the create submit seeds it.
  const { data: identity } = useUserIdentity();
  const { data: orgs } = useOrgs(!createMode);
  const createWorkspace = useCreateOrg();
  const orgCreated = useRef(false);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameIds = useFieldIds();
  const businessIds = useFieldIds();

  const activeOrg = orgs?.orgs.find((candidate) => candidate.id === getActiveOrgId()) ?? null;
  const orgName = activeOrg?.name ?? '';
  // Only the OWNER may rename the org (the server answers 403 otherwise), so
  // a member who reaches this screen gets a read-only field instead of a
  // submit that can never succeed.
  const canRenameOrg = createMode || activeOrg?.isOwner === true;

  // Pre-fill from whatever already exists: the account name prefers the
  // shared identity (or the legacy org profile), the business name is the
  // active org's name. Copied into state rather than read through a fallback
  // on every render — otherwise clearing the field would instantly re-fill it
  // with the Google/OAuth name. The `touched` refs are what keep it from
  // re-filling a field the user deliberately emptied, while still letting data
  // that arrives late (queries resolve after mount) land in an untouched one.
  const nameTouched = useRef(false);
  const businessTouched = useRef(false);
  useEffect(() => {
    const existingName = identity?.username || '';
    const existingBusiness = activeOrg?.name ?? '';
    setName((previous) =>
      nameTouched.current || previous !== '' ? previous : existingName || previous,
    );
    setBusinessName((previous) =>
      businessTouched.current || previous !== '' ? previous : existingBusiness || previous,
    );
  }, [identity, profile, activeOrg]);

  const currentName = name;
  const currentBusiness = businessName;

  async function handleComplete() {
    const trimmedName = currentName.trim();
    const trimmedBusiness = currentBusiness.trim();

    if (!trimmedName) {
      setError('Masukkan nama kamu.');
      setStep(0);
      return;
    }
    if (!trimmedBusiness) {
      setError('Masukkan nama usaha kamu.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Create mode: mint the workspace first, named after the business.
      // `onSuccess` inside the hook makes it the active org, so the profile
      // write below lands in the org this submit just created. The business
      // name lives on the org row — the profile row carries only the person.
      if (createMode && !orgCreated.current) {
        await createWorkspace.mutateAsync({ name: trimmedBusiness });
        orgCreated.current = true;
      } else if (!createMode && canRenameOrg) {
        // The org already exists; its name IS the business name. Renaming here
        // is the only way an owning account can correct it during onboarding.
        // Skipped for members: the field is read-only for them, and a 403 from
        // the owner-only endpoint would otherwise block onboarding entirely.
        const orgId = getActiveOrgId();
        if (orgId && trimmedBusiness !== orgName) {
          await renameOrg(orgId, trimmedBusiness);
        }
      }
      // The account name has ONE home: the shared identity below. No per-org
      // profile row is written any more — that second row was why one sign-up
      // showed up as two people in the database.
      // The username is the SHARED account identity (`userProfiles/<userId>`):
      // written here so it exists even before the first workspace does (in
      // create mode), and kept in sync whenever the name changes. Kelola
      // Profil edits it later alongside the phone. A failure lands in the
      // catch below — retrying skips the org (`orgCreated`), re-saves the
      // profile harmlessly, and retries this write.
      await saveUserIdentity({ username: trimmedName });
      // Profile persisted — queue the welcome tour so it starts once the
      // dashboard mounts (it only mounts now that the profile is complete).
      scheduleTour('welcome');
      // Invalidate so AuthGate sees the fresh profile/org and mounts the
      // dashboard — and so Kelola Profil opens on the identity just written
      // instead of a stale empty cache.
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userProfile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
    } catch (cause) {
      // After a successful create the retry path saves the profile only —
      // the inline message comes from the layer that actually failed.
      setError(isAppError(cause) ? cause.message : 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = step === 1;
  const canAdvance = currentName.trim().length > 0;

  return (
    <Modal
      open
      onClose={() => undefined}
      dismissible={false}
      ariaLabelledBy="onboarding-title"
      header={
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          <span
            className={`h-2 rounded-full transition-all duration-300 ${
              step === 0 ? 'w-8 bg-accent' : 'w-2 bg-border'
            }`}
          />
          <span
            className={`h-2 rounded-full transition-all duration-300 ${
              step === 1 ? 'w-8 bg-accent' : 'w-2 bg-border'
            }`}
          />
        </div>
      }
      headerClassName="flex items-center justify-center py-4"
      bodyClassName="relative overflow-hidden"
      footerClassName="flex items-center justify-between border-t border-border bg-background px-5 py-4 sm:px-6"
      footer={
        <>
          {step === 1 ? (
            <Button variant="ghost" size="md" onClick={() => setStep(0)} disabled={submitting}>
              <ArrowLeft size={16} aria-hidden="true" />
              Kembali
            </Button>
          ) : (
            <span />
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}

          {isLast ? (
            <Button size="md" loading={submitting} onClick={() => void handleComplete()}>
              <Check size={16} aria-hidden="true" />
              {createMode ? 'Buat dan mulai' : 'Selesai'}
            </Button>
          ) : (
            <Button size="md" disabled={!canAdvance} onClick={() => setStep(1)}>
              Lanjut
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </>
      }
    >
      {/* Sliding content */}
      <div
        className="flex transition-transform duration-400 ease-out"
        style={{ transform: `translateX(-${step * 100}%)` }}
      >
        {/* Step 0: name */}
        <div className="w-full shrink-0 px-5 py-6 sm:px-6 sm:py-8">
          <h2 id="onboarding-title" className="text-xl font-semibold text-foreground">
            Siapa nama kamu?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Nama ini akan muncul di invoice dan pengaturan akun kamu.
          </p>
          <div className="mt-6 flex flex-col gap-1.5">
            <label htmlFor={nameIds.id} className="text-sm font-medium text-foreground">
              Nama lengkap <span className="text-danger">*</span>
            </label>
            <Input
              id={nameIds.id}
              value={currentName}
              onChange={(event) => {
                nameTouched.current = true;
                setName(event.target.value);
                setError(null);
              }}
              placeholder="Fandy Ahmad"
              autoComplete="name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canAdvance) setStep(1);
              }}
            />
          </div>
        </div>

        {/* Step 1: business name */}
        <div className="w-full shrink-0 px-5 py-6 sm:px-6 sm:py-8">
          <h2 className="text-xl font-semibold text-foreground">Apa nama usahamu?</h2>
          <p className="mt-1 text-sm text-muted">
            {createMode
              ? 'Nama usaha ini juga jadi nama organisasi (ruang kerja) kamu di Notain — semua data tersimpan di dalamnya.'
              : 'Nama usaha akan tampil di header invoice yang kamu kirim.'}
          </p>
          <div className="mt-6 flex flex-col gap-1.5">
            <label htmlFor={businessIds.id} className="text-sm font-medium text-foreground">
              Nama usaha <span className="text-danger">*</span>
            </label>
            <Input
              id={businessIds.id}
              value={currentBusiness}
              onChange={(event) => {
                businessTouched.current = true;
                setBusinessName(event.target.value);
                setError(null);
              }}
              placeholder="Bengkel Jaya"
              autoComplete="organization"
              disabled={!canRenameOrg}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleComplete();
              }}
            />
            {!canRenameOrg && (
              <p className="text-xs text-muted">Nama usaha organisasi ini diatur oleh owner-nya.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
