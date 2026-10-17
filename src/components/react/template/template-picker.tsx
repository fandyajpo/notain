import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { createSampleInvoice, SAMPLE_BUSINESS } from '../../../core/invoice/sample';
import type { BusinessProfile } from '../../../core/profile/model';
import type { InvoiceTemplate } from '../../../core/template/model';
import { groupTemplatesForBusiness } from '../../../core/template/resolve';
import { businessSubtypeLabel, type BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import { InvoicePreview } from '../invoice/invoice-preview';
import { Badge } from '../ui/badge';
import { PageHeader } from '../ui/page-header';

/**
 * Width the thumbnail lays the invoice out at before scaling it down to the
 * card. A real `InvoicePreview` is rendered rather than a stylised stand-in so
 * what the user picks is what the builder shows — a stand-in would drift the
 * moment a block type or a theme token changed.
 */
const RENDER_WIDTH = 760;
const THUMBNAIL_HEIGHT = 210;

type ThumbnailProps = {
  template: InvoiceTemplate;
  logoUrl?: string | null;
  /** The viewer's own business, so the preview reads like their invoice. */
  business?: BusinessProfile | null;
};

/**
 * A live invoice rendered at card width. The scale follows the card rather
 * than being hard-coded, so the grid can reflow from three columns to one
 * without cropping each template differently.
 */
export function TemplateThumbnail({ template, logoUrl, business }: ThumbnailProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  // Keyed on the profile so a refetched query doesn't rebuild the sample.
  const sample = useMemo(
    () => createSampleInvoice(new Date(), business?.name ? business : SAMPLE_BUSINESS),
    [business],
  );

  useEffect(() => {
    const node = boxRef.current;
    // jsdom has no ResizeObserver; the test renders then asserts on markup.
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setScale(width / RENDER_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden bg-white"
      style={{ height: THUMBNAIL_HEIGHT }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 origin-top-left"
        style={{ width: RENDER_WIDTH, transform: `scale(${scale})` }}
      >
        <InvoicePreview
          business={sample.business}
          invoice={sample.draft}
          template={template}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}

type CardProps = {
  template: InvoiceTemplate;
  logoUrl?: string | null;
  /** The viewer's own business, so the preview reads like their invoice. */
  business?: BusinessProfile | null;
  selected?: boolean;
  onPick?: (templateId: string) => void;
  /** Extra row under the name, for list pages that are not pickers. */
  actions?: ReactNode;
};

export function TemplateCard({
  template,
  logoUrl,
  business,
  selected = false,
  onPick,
  actions,
}: CardProps) {
  const body = (
    <>
      <TemplateThumbnail template={template} logoUrl={logoUrl} business={business} />
      <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
        <span className="truncate">{template.name}</span>
        {selected && <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />}
        {template.businessType && (
          <Badge variant="accent" size="sm" className="shrink-0">
            {businessSubtypeLabel(template.businessType)}
          </Badge>
        )}
        <span className="ml-auto shrink-0 text-xs font-normal text-muted">
          {template.builtin ? 'Bawaan' : 'Template saya'}
        </span>
      </span>
    </>
  );

  const className = [
    'block w-full overflow-hidden rounded-card border bg-card text-left shadow-card transition-shadow',
    'focus-ring hover:border-accent/60 hover:shadow-raised',
    selected ? 'border-accent ring-1 ring-accent shadow-raised' : 'border-border',
  ].join(' ');

  if (onPick) {
    return (
      <button
        type="button"
        className={className}
        data-template-id={template.id}
        aria-pressed={selected}
        onClick={() => onPick(template.id)}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={className} data-template-id={template.id}>
      {body}
      {actions && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">{actions}</div>
      )}
    </div>
  );
}

type PickerProps = {
  templates: readonly InvoiceTemplate[];
  /** Rendered as the pre-selected card; also the shape used by the builder's switcher. */
  selectedId?: string;
  logoUrl?: string | null;
  /** The viewer's own business, so the preview reads like their invoice. */
  business?: BusinessProfile | null;
  /** The viewer's chosen business type; groups but never hides the rest. */
  businessType?: BusinessSubtypeSlug | null;
  onPick: (templateId: string) => void;
};

/** Step one of `/invoice/new`: choose the look before entering any data. */
export function TemplatePicker({
  templates,
  selectedId,
  logoUrl,
  business,
  businessType,
  onPick,
}: PickerProps) {
  const { matching, others } = groupTemplatesForBusiness(templates, businessType);
  // Grouping only earns its headers when something actually matched — with no
  // chosen type (or a brand-new account) the flat list from before stands.
  const grouped = matching.length > 0;

  const grid = (list: readonly InvoiceTemplate[]) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          logoUrl={logoUrl}
          business={business}
          selected={template.id === selectedId}
          onPick={onPick}
        />
      ))}
    </div>
  );

  if (!grouped) {
    return (
      <div className="flex w-full flex-col gap-6">
        <PageHeader
          title="Pilih template invoice"
          description="Tampilannya bisa diganti kapan saja. Data invoice yang kamu isi tetap tersimpan."
        />
        {grid(templates)}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Pilih template invoice"
        description="Tampilannya bisa diganti kapan saja. Data invoice yang kamu isi tetap tersimpan."
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow uppercase text-muted">Sesuai bisnis kamu</h2>
        {grid(matching)}
      </section>
      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-eyebrow uppercase text-muted">Jenis lain</h2>
          {grid(others)}
        </section>
      )}
    </div>
  );
}
