import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { createSampleInvoice } from '../../../core/invoice/sample';
import type { InvoiceTemplate } from '../../../core/template/model';
import { InvoicePreview } from '../invoice/invoice-preview';

/**
 * Width the thumbnail lays the invoice out at before scaling it down to the
 * card. A real `InvoicePreview` is rendered rather than a stylised stand-in so
 * what the user picks is what the builder shows — a stand-in would drift the
 * moment a block type or a theme token changed.
 */
const RENDER_WIDTH = 760;
const THUMBNAIL_HEIGHT = 210;

const SAMPLE = createSampleInvoice();

type ThumbnailProps = {
  template: InvoiceTemplate;
  logoUrl?: string | null;
};

/**
 * A live invoice rendered at card width. The scale follows the card rather
 * than being hard-coded, so the grid can reflow from three columns to one
 * without cropping each template differently.
 */
export function TemplateThumbnail({ template, logoUrl }: ThumbnailProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

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
          business={SAMPLE.business}
          invoice={SAMPLE.draft}
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
  selected?: boolean;
  onPick?: (templateId: string) => void;
  /** Extra row under the name, for list pages that are not pickers. */
  actions?: ReactNode;
};

export function TemplateCard({ template, logoUrl, selected = false, onPick, actions }: CardProps) {
  const body = (
    <>
      <TemplateThumbnail template={template} logoUrl={logoUrl} />
      <span className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-foreground">
        {template.name}
        {selected && <Check size={14} className="text-accent" aria-hidden="true" />}
        <span className="ml-auto text-xs font-normal text-muted">
          {template.builtin ? 'Bawaan' : 'Template saya'}
        </span>
      </span>
    </>
  );

  const className = [
    'block w-full overflow-hidden rounded-card border bg-card text-left shadow-card transition-colors',
    'focus-ring hover:border-accent/60',
    selected ? 'border-accent ring-1 ring-accent' : 'border-border',
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
  onPick: (templateId: string) => void;
};

/** Step one of `/invoice/new`: choose the look before entering any data. */
export function TemplatePicker({ templates, selectedId, logoUrl, onPick }: PickerProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Pilih template invoice</h1>
        <p className="mt-1 text-sm text-muted">
          Tampilannya bisa diganti kapan saja. Data invoice yang kamu isi tetap tersimpan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            logoUrl={logoUrl}
            selected={template.id === selectedId}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}
