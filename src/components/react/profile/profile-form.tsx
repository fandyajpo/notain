import { type AnyFieldApi, useForm } from '@tanstack/react-form';
import { useSelector } from '@tanstack/react-store';
import { useEffect, useState } from 'react';
import {
  profileFormSchema,
  type BusinessProfile,
  type ProfileFormValues,
} from '../../../core/profile/model';
import { isBusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { toAppError } from '../../../app/errors';
import { useSaveProfile, useUploadLogo, useRemoveLogo } from '../../../lib/query/hooks/use-profile';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { LogoUploader } from '../invoice/logo-uploader';
import { BusinessTypeField } from '../business/business-type-field';

type Props = {
  profile: BusinessProfile;
};

/**
 * Business profile editor: the person's identity + contact fields and the
 * invoice logo. `businessName` deliberately has NO input here — it is the
 * ORGANIZATION's name (settings → Organisasi → rename), which the server
 * mirrors into the profile row. It stays in the form values only so the
 * shared `profileFormSchema` still types the payload; every write reads it
 * from the `profile` prop instead, so a rename elsewhere can never be
 * reverted by a later save of this form.
 */
export function ProfileForm({ profile }: Props) {
  const saveProfile = useSaveProfile();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const [serverError, setServerError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(profile.logoUrl);

  useEffect(() => {
    setLogoUrl(profile.logoUrl);
  }, [profile.logoUrl]);

  const form = useForm({
    defaultValues: {
      name: profile.name,
      businessName: profile.businessName ?? '',
      phone: profile.phone,
      address: profile.address ?? '',
      email: profile.email ?? '',
      // The form keeps every value as a string; '' means "no type". The
      // grouped picker below owns the selection.
      businessType: profile.businessType ?? '',
    } satisfies ProfileFormValues,
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value }) => {
      setServerError(null);
      try {
        await saveProfile.mutateAsync({
          name: value.name.trim(),
          // From the prop, not the form: the org's rename (which mirrors into
          // the profile row) may have landed after this form mounted.
          businessName: (profile.businessName ?? '').trim(),
          phone: value.phone.trim(),
          address: value.address.trim() || undefined,
          email: value.email.trim() || undefined,
          businessType: value.businessType || null,
          logoFileId: profile.logoFileId,
          plan: profile.plan,
          planExpiresAt: profile.planExpiresAt,
        });
        toast('Profil usaha berhasil disimpan.', { variant: 'success' });
      } catch (error) {
        setServerError(toAppError(error).message);
      }
    },
  });

  const businessType = useSelector(form.store, (state) => state.values.businessType);

  const currentProfile = (): BusinessProfile => ({
    name: form.state.values.name.trim() || profile.name,
    businessName: profile.businessName || '',
    phone: form.state.values.phone.trim() || profile.phone,
    address: form.state.values.address.trim() || undefined,
    email: form.state.values.email.trim() || undefined,
    businessType: form.state.values.businessType || profile.businessType,
    logoFileId: profile.logoFileId,
    logoUrl,
    plan: profile.plan,
    planExpiresAt: profile.planExpiresAt,
  });

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {serverError && <Notice variant="danger">{serverError}</Notice>}

      <LogoUploader
        logoUrl={logoUrl}
        busy={uploadLogo.isPending || removeLogo.isPending}
        onUpload={(file) => {
          void uploadLogo
            .mutateAsync({ file, current: currentProfile() })
            .then((saved) => {
              setLogoUrl(saved.logoUrl);
              toast('Logo berhasil diunggah.', { variant: 'success' });
            })
            .catch((error: unknown) => {
              toast(
                typeof error === 'object' && error !== null && 'message' in error
                  ? String((error as { message: string }).message)
                  : 'Logo gagal diunggah.',
                { variant: 'error' },
              );
            });
        }}
        onRemove={() => {
          void removeLogo
            .mutateAsync(currentProfile())
            .then((saved) => {
              setLogoUrl(saved.logoUrl);
              toast('Logo dihapus.', { variant: 'success' });
            })
            .catch(() => toast('Logo gagal dihapus.', { variant: 'error' }));
        }}
      />

      <form.Field name="name">
        {(field) => (
          <ProfileField
            field={field}
            label="Nama kamu"
            placeholder="Fandy Ahmad"
            required
            autoComplete="name"
          />
        )}
      </form.Field>

      <BusinessTypeField
        value={isBusinessSubtypeSlug(businessType) ? businessType : null}
        description="Dipakai untuk mengelompokkan template, mengisi contoh invoice, dan menentukan tampilan halaman usaha publik."
        onChange={(slug) => form.setFieldValue('businessType', slug ?? '')}
      />

      <form.Field name="phone">
        {(field) => (
          <ProfileField
            field={field}
            label="Nomor WhatsApp (opsional)"
            placeholder="081234567890"
            inputMode="tel"
            hint="Dipakai di invoice dan pesan WhatsApp."
            autoComplete="tel"
          />
        )}
      </form.Field>

      <form.Field name="address">
        {(field) => (
          <ProfileField
            field={field}
            label="Alamat (opsional)"
            placeholder="Jl. Melati No. 12, Bandung"
            autoComplete="street-address"
          />
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <ProfileField
            field={field}
            label="Email (opsional)"
            type="email"
            placeholder="halo@warungmaju.id"
            autoComplete="email"
          />
        )}
      </form.Field>

      <div>
        <Button type="submit" size="lg" loading={saveProfile.isPending}>
          Simpan profil
        </Button>
      </div>
    </form>
  );
}

type ProfileFieldProps = {
  field: AnyFieldApi;
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  inputMode?: 'tel' | 'text' | 'numeric';
  autoComplete?: string;
};

function ProfileField({
  field,
  label,
  type = 'text',
  placeholder,
  hint,
  required = false,
  inputMode = 'text',
  autoComplete,
}: ProfileFieldProps) {
  const { id } = useFieldIds();
  const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined;

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={field.state.value ?? ''}
        placeholder={placeholder}
        autoComplete={autoComplete}
        invalid={Boolean(error)}
        aria-invalid={error ? 'true' : undefined}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
      />
    </FieldShell>
  );
}
