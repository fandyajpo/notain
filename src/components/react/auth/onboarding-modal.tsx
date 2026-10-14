import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile, useSaveProfile } from '../../../lib/query/hooks/use-profile';
import { queryKeys } from '../../../lib/query/keys';
import { Button } from '../ui/button';
import { controlClass, useFieldIds } from '../ui/field';

/**
 * Two-step onboarding: personal name, then business name.
 *
 * Mounted by AuthGate only when the profile row is missing one of the two
 * fields. On completion the profile is saved and the query is invalidated —
 * AuthGate re-renders, sees the profile is now complete, and mounts the
 * dashboard children for the first time. There is nothing to inspect-and-delete
 * beforehand because the children were never in the DOM.
 */
export function OnboardingModal() {
  const { data: profile } = useProfile();
  const saveProfile = useSaveProfile();
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
      await saveProfile.mutateAsync({
        ...(profile ?? {
          name: '',
          businessName: '',
          phone: '',
          plan: 'free' as const,
          planExpiresAt: null,
        }),
        name: trimmedName,
        businessName: trimmedBusiness,
      });
      // Invalidate so AuthGate sees the fresh profile and mounts the dashboard.
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    } catch {
      setError('Gagal menyimpan. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = step === 1;
  const canAdvance = currentName.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-card border border-border bg-card shadow-modal">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 border-b border-border px-6 py-4">
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

        {/* Sliding content */}
        <div className="relative overflow-hidden">
          <div
            className="flex transition-transform duration-400 ease-out"
            style={{ transform: `translateX(-${step * 100}%)` }}
          >
            {/* Step 0: name */}
            <div className="w-full shrink-0 px-6 py-8">
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
                <input
                  id={nameIds.id}
                  value={currentName}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Fandy Ahmad"
                  autoComplete="name"
                  autoFocus
                  className={controlClass()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canAdvance) setStep(1);
                  }}
                />
              </div>
            </div>

            {/* Step 1: business name */}
            <div className="w-full shrink-0 px-6 py-8">
              <h2 className="text-xl font-semibold text-foreground">Apa nama usahamu?</h2>
              <p className="mt-1 text-sm text-muted">
                Nama usaha akan tampil di header invoice yang kamu kirim.
              </p>
              <div className="mt-6 flex flex-col gap-1.5">
                <label htmlFor={businessIds.id} className="text-sm font-medium text-foreground">
                  Nama usaha <span className="text-danger">*</span>
                </label>
                <input
                  id={businessIds.id}
                  value={currentBusiness}
                  onChange={(event) => {
                    setBusinessName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Bengkel Jaya"
                  autoComplete="organization"
                  className={controlClass()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleComplete();
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          {step === 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(0)}
              disabled={submitting}
            >
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
            <Button
              size="sm"
              loading={submitting}
              onClick={() => void handleComplete()}
            >
              <Check size={16} aria-hidden="true" />
              Selesai
            </Button>
          ) : (
            <Button size="sm" disabled={!canAdvance} onClick={() => setStep(1)}>
              Lanjut
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
