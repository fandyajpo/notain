import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile, useSaveProfile } from '../../../lib/query/hooks/use-profile';
import { useCreateOrg } from '../../../lib/query/hooks/use-orgs';
import { isAppError } from '../../../core/shared/errors';
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
 * - **Normal** — AuthGate renders it when the profile row is missing one of
 *   the two fields; completion saves the profile, AuthGate re-renders and
 *   mounts the dashboard children for the first time.
 * - **Create** (`createOrg`) — OrgGate renders it instead of a bare "make an
 *   organization" card when the account has zero orgs. The business name IS
 *   the workspace: the second step's submit creates the org named after it
 *   (the server seeds the profile row with the same business name), then
 *   writes the profile — so a fresh sign-up fills one flow, not two screens
 *   asking overlapping questions.
 *
 * `orgCreated` makes the create step run at most once: if the org was made
 *   but the profile write failed, retrying `Selesai` must save the profile
 *   only — never mint a second org with the same name.
 */
export function OnboardingModal({ createOrg = false }: { createOrg?: boolean }) {
  const createMode = createOrg;
  // No org yet → no profile row to read; the create submit seeds it.
  const { data: profile } = useProfile(!createMode);
  const saveProfile = useSaveProfile();
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

  // Pre-fill from whatever the profile already has.
  const currentName = name || profile?.name || '';
  const currentBusiness = businessName || profile?.businessName || '';

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
      // write below lands in the org this submit just created.
      if (createMode && !orgCreated.current) {
        await createWorkspace.mutateAsync({
          name: trimmedBusiness,
          businessName: trimmedBusiness,
        });
        orgCreated.current = true;
      }
      await saveProfile.mutateAsync({
        ...(profile ?? {
          name: '',
          businessName: '',
          phone: '',
          businessType: null,
          plan: 'free' as const,
          planExpiresAt: null,
        }),
        name: trimmedName,
        businessName: trimmedBusiness,
      });
      // Profile persisted — queue the welcome tour so it starts once the
      // dashboard mounts (it only mounts now that the profile is complete).
      scheduleTour('welcome');
      // Invalidate so AuthGate sees the fresh profile and mounts the dashboard.
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
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
            <Button variant="ghost" size="sm" onClick={() => setStep(0)} disabled={submitting}>
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
            <Button size="sm" loading={submitting} onClick={() => void handleComplete()}>
              <Check size={16} aria-hidden="true" />
              {createMode ? 'Buat dan mulai' : 'Selesai'}
            </Button>
          ) : (
            <Button size="sm" disabled={!canAdvance} onClick={() => setStep(1)}>
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
                setBusinessName(event.target.value);
                setError(null);
              }}
              placeholder="Bengkel Jaya"
              autoComplete="organization"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleComplete();
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
