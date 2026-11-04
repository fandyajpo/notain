import { useEffect, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toAppError } from '../../../app/errors';
import { updateOrgContact, uploadOrgLogo } from '../../../app/org-contact';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
import { queryKeys } from '../../../lib/query/keys';
import { useOrgs } from '../../../lib/query/hooks/use-orgs';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { FieldShell, useFieldIds } from '../ui/field';
import { Input } from '../ui/input';
import { Notice } from '../ui/notice';
import { LoadingState } from '../ui/state';

/**
 * "Kontak usaha" editor — the Organization's contact identity block
 * (email, phone, website, address, taxId, logo): what invoices and the
 * public page read directly from the `organizations` row.
 *
 * Owner-only by design: the server answers 403 for members, so non-owners
 * get a disabled form with a hint instead of a submit that can never
 * succeed. The shared user identity (username/phone) lives in Kelola Profil
 * and is deliberately not editable here — the two-entity model keeps the
 * person and the organization separate.
 */
const phonePattern = /^(?:\+?62|0)8\d{7,12}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OrgContactEditor() {
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const { data: orgs, isLoading: orgsLoading, isError: orgsError, refetch } = useOrgs();
  const queryClient = useQueryClient();

  const current = orgs?.orgs.find((org) => org.id === orgId) ?? null;
  const isOwner = current?.isOwner === true;

  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [fields, setFields] = useState({
    email: '',
    phone: '',
    website: '',
    address: '',
    taxId: '',
  });
  const hydratedFor = useRef<string | null>(null);

  // Hydrate from the org row the switcher already loaded — no second request
  // and no private loading/error state: `useOrgs` owns both.
  useEffect(() => {
    if (!current || hydratedFor.current === current.id) return;
    hydratedFor.current = current.id;
    setFields({
      email: current.email ?? '',
      phone: current.phone ?? '',
      website: current.website ?? '',
      address: current.address ?? '',
      taxId: current.taxId ?? '',
    });
    setLogoUrl(
      current.logoFileId ? `/api/logo/${encodeURIComponent(current.logoFileId)}` : undefined,
    );
  }, [current]);

  const emailIds = useFieldIds();
  const phoneIds = useFieldIds();
  const websiteIds = useFieldIds();
  const addressIds = useFieldIds();
  const taxIds = useFieldIds();
  const logoIds = useFieldIds();
  const logoInput = useRef<HTMLInputElement | null>(null);

  const emailError =
    fields.email !== '' && !emailPattern.test(fields.email)
      ? 'Email organisasi tidak valid.'
      : null;
  const phoneError =
    fields.phone !== '' && !phonePattern.test(fields.phone)
      ? 'Masukkan nomor WhatsApp yang valid, contoh 081234567890.'
      : null;

  async function handleSave() {
    if (!orgId) return;
    setServerError(null);
    if (emailError || phoneError) {
      setServerError(emailError ?? phoneError);
      return;
    }
    setSaving(true);
    try {
      // PATCH semantics: empty string clears the column server-side (null).
      await updateOrgContact(orgId, {
        email: fields.email.trim() || null,
        phone: fields.phone.trim() || null,
        website: fields.website.trim() || null,
        address: fields.address.trim() || null,
        taxId: fields.taxId.trim() || null,
      });
      // The org list is the read model for this form — refresh it so the card
      // and the public-page link show the saved values.
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
      toast('Kontak organisasi tersimpan.', { variant: 'success' });
    } catch (error) {
      setServerError(toAppError(error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(file: File) {
    if (!orgId) return;
    setUploading(true);
    setServerError(null);
    try {
      const fileId = await uploadOrgLogo(file);
      await updateOrgContact(orgId, { logoFileId: fileId });
      setLogoUrl(`/api/logo/${encodeURIComponent(fileId)}`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs });
      toast('Logo organisasi diperbarui.', { variant: 'success' });
    } catch (error) {
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setUploading(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  }

  if (orgsLoading) {
    return <LoadingState label="Memuat kontak organisasi…" />;
  }

  if (orgsError || !current) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-danger">
          Kontak organisasi gagal dimuat. Periksa koneksi internet kamu.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      {serverError && <Notice variant="danger">{serverError}</Notice>}
      {!isOwner && (
        <Notice variant="accent">Hanya owner yang bisa mengubah kontak organisasi ini.</Notice>
      )}

      <FieldShell
        label="Logo usaha"
        htmlFor={logoIds.id}
        hint="Tampil di invoice dan halaman publik organisasi ini. Maksimal 2 MB (PNG, JPG, SVG, WEBP, ICO)."
      >
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo organisasi"
              className="h-12 w-12 rounded-control object-contain"
            />
          )}
          <input
            ref={logoInput}
            id={logoIds.id}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,image/vnd.microsoft.icon"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleLogo(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploading}
            disabled={!isOwner}
            onClick={() => logoInput.current?.click()}
          >
            Pilih logo
          </Button>
        </div>
      </FieldShell>

      <FieldShell
        label="Email usaha (opsional)"
        htmlFor={emailIds.id}
        error={emailError ?? undefined}
      >
        <Input
          id={emailIds.id}
          type="email"
          value={fields.email}
          placeholder="halo@usaha.id"
          disabled={!isOwner}
          invalid={Boolean(emailError)}
          aria-invalid={emailError ? 'true' : undefined}
          onChange={(event) => setFields((f) => ({ ...f, email: event.target.value }))}
        />
      </FieldShell>

      <FieldShell
        label="Nomor WhatsApp usaha (opsional)"
        htmlFor={phoneIds.id}
        error={phoneError ?? undefined}
      >
        <Input
          id={phoneIds.id}
          inputMode="tel"
          value={fields.phone}
          placeholder="081234567890"
          disabled={!isOwner}
          invalid={Boolean(phoneError)}
          aria-invalid={phoneError ? 'true' : undefined}
          onChange={(event) => setFields((f) => ({ ...f, phone: event.target.value }))}
        />
      </FieldShell>

      <FieldShell label="Website (opsional)" htmlFor={websiteIds.id}>
        <Input
          id={websiteIds.id}
          value={fields.website}
          placeholder="https://usaha.id"
          disabled={!isOwner}
          onChange={(event) => setFields((f) => ({ ...f, website: event.target.value }))}
        />
      </FieldShell>

      <FieldShell label="Alamat (opsional)" htmlFor={addressIds.id}>
        <Input
          id={addressIds.id}
          value={fields.address}
          placeholder="Jl. Melati No. 12, Bandung"
          disabled={!isOwner}
          onChange={(event) => setFields((f) => ({ ...f, address: event.target.value }))}
        />
      </FieldShell>

      <FieldShell label="NPWP / tax ID (opsional)" htmlFor={taxIds.id}>
        <Input
          id={taxIds.id}
          value={fields.taxId}
          disabled={!isOwner}
          onChange={(event) => setFields((f) => ({ ...f, taxId: event.target.value }))}
        />
      </FieldShell>

      <div>
        <Button type="submit" size="lg" loading={saving} disabled={!isOwner}>
          Simpan kontak organisasi
        </Button>
      </div>
    </form>
  );
}
