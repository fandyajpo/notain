import { useEffect, useRef, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { toAppError } from '../../../app/errors';
import {
  getOrgContact,
  updateOrgContact,
  uploadOrgLogo,
  type OrgContact,
} from '../../../app/org-contact';
import { getActiveOrgId, subscribeActiveOrg } from '../../../app/active-org';
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

type FieldKey = 'email' | 'phone' | 'website' | 'address' | 'taxId';

export function OrgContactEditor() {
  const orgId = useSyncExternalStore(subscribeActiveOrg, getActiveOrgId, () => null);
  const { data: orgs } = useOrgs();
  const isOwner = orgs?.orgs.find((org) => org.id === orgId)?.isOwner === true;

  const [contact, setContact] = useState<OrgContact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);
    getOrgContact(orgId)
      .then((loaded) => {
        if (cancelled) return;
        setContact(loaded);
        setLogoUrl(
          loaded.logoFileId ? `/api/logo/${encodeURIComponent(loaded.logoFileId)}` : undefined,
        );
        setFields((current) => ({ ...current }));
        setHydratedFor.current = null;
        setFields({
          email: loaded.email ?? '',
          phone: loaded.phone ?? '',
          website: loaded.website ?? '',
          address: loaded.address ?? '',
          taxId: loaded.taxId ?? '',
        });
        setHydratedFor.current = orgId;
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const emailIds = useFieldIds();
  const phoneIds = useFieldIds();
  const websiteIds = useFieldIds();
  const addressIds = useFieldIds();
  const taxIds = useFieldIds();
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
      toast('Logo organisasi diperbarui.', { variant: 'success' });
    } catch (error) {
      toast(toAppError(error).message, { variant: 'error' });
    } finally {
      setUploading(false);
      if (logoInput.current) logoInput.current.value = '';
    }
  }

  if (!orgId || isLoading) {
    return <LoadingState label="Memuat kontak organisasi…" />;
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-danger">
          Kontak organisasi gagal dimuat. Periksa koneksi internet kamu.
        </p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Muat ulang halaman
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
        <Notice variant="info">
          Hanya owner yang bisa mengubah kontak organisasi ini.
        </Notice>
      )}

      <FieldShell
        label="Logo usaha"
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