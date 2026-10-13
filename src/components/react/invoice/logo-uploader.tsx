import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { LOGO_MAX_BYTES, LOGO_ALLOWED_TYPES } from '../../../core/profile/logo';
import { Button } from '../ui/button';

type Props = {
  logoUrl?: string | null;
  /** True while a replacement upload is in flight. */
  busy?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
};

const MAX_MB = LOGO_MAX_BYTES / (1024 * 1024);

/** Icon picker that uploads the chosen image through the logo API. */
export function LogoUploader({ logoUrl, busy = false, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      setError('Format harus PNG, JPG, SVG, WEBP, atau ICO.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError(`Logo terlalu besar. Maksimal ${MAX_MB} MB.`);
      return;
    }
    onUpload(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-background">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo usaha"
              width={64}
              height={64}
              decoding="async"
              className="size-full object-contain"
            />
          ) : (
            <ImagePlus size={20} className="text-muted" aria-hidden="true" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_ALLOWED_TYPES.join(',')}
            className="sr-only"
            aria-label="Pilih file logo"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            {logoUrl ? 'Ganti logo' : 'Unggah logo'}
          </Button>
          {logoUrl && (
            <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
              <Trash2 size={14} aria-hidden="true" />
              Hapus
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Logo dipakai di kop invoice dan PDF. Format PNG/JPG/SVG/WEBP/ICO, maksimal {MAX_MB} MB.
      </p>

      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
