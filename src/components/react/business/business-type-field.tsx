import { useState } from 'react';
import { businessSubtypeLabel, type BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Modal } from '../ui/modal';
import { BusinessTypePicker } from './business-type-picker';

type Props = {
  value: BusinessSubtypeSlug | null;
  onChange: (slug: BusinessSubtypeSlug | null) => void;
  /** Extra line under the label, when the surrounding screen needs its own wording. */
  description?: string;
};

/**
 * The template (and later settings) control for the stored business type: a
 * read-only row showing the current choice, with the full grouped picker
 * behind "Ubah". The picker itself is shared with the first-run step, so the
 * two screens can never drift apart.
 *
 * Committing happens on save, not on tap — the modal owns a draft so closing
 * it with Escape never half-applies a choice.
 */
export function BusinessTypeField({ value, onChange, description }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BusinessSubtypeSlug | null>(value);
  const label = businessSubtypeLabel(value);

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Jenis bisnis</p>
          <p className="text-sm text-muted">
            {description ?? 'Menentukan contoh teks dan susunan blok untuk template baru.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">{label ?? 'Belum ditentukan'}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(value);
              setOpen(true);
            }}
          >
            Ubah
          </Button>
        </div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pilih jenis bisnis"
        size="lg"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={draft === null}
              onClick={() => setDraft(null)}
            >
              Tanpa jenis
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onChange(draft);
                  setOpen(false);
                }}
              >
                Simpan
              </Button>
            </div>
          </div>
        }
      >
        <BusinessTypePicker value={draft} onChange={setDraft} />
      </Modal>
    </>
  );
}
