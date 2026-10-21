import { useState } from 'react';
import type { BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PageHeader } from '../ui/page-header';
import { BusinessTypePicker } from './business-type-picker';

type Props = {
  /**
   * The remembered profile choice, preselected so a returning user confirms
   * instead of searching again. `null`/omitted starts empty.
   */
  value?: BusinessSubtypeSlug | null;
  /** Called with the picked subtype; the caller saves it and moves on. */
  onPick: (slug: BusinessSubtypeSlug) => void;
  /** Called when the user prefers to decide later — the template stays generic. */
  onSkip: () => void;
};

/**
 * The question that opens every `/templates/new`: which trade is this
 * template for? The answer seeds the editor below (prose, sample wording,
 * block recipe) and, once the template is saved, is remembered on the
 * profile — so the next visit preselects it rather than asking from scratch.
 * Skipping keeps this template generic and leaves the profile untouched.
 *
 * Not onboarding and not per-invoice: the ask sits exactly where the answer
 * shapes the result, and editing an existing template never shows it.
 */
export function BusinessTypeStep({ value, onPick, onSkip }: Props) {
  const [selected, setSelected] = useState<BusinessSubtypeSlug | null>(value ?? null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Jenis usaha kamu"
        description="Biar template, teks, dan contoh invoice-nya langsung cocok dengan usahamu. Pilihan ini bisa diubah kapan saja di Settings."
      />

      <Card>
        <BusinessTypePicker value={selected} onChange={setSelected} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onSkip}>
          Lewati, pakai yang umum
        </Button>
        <Button
          disabled={!selected}
          onClick={() => {
            if (selected) onPick(selected);
          }}
        >
          Lanjutkan
        </Button>
      </div>
    </div>
  );
}
