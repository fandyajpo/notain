import { Markdown } from '@tanstack/markdown/react';
import type { CSSProperties, ReactNode } from 'react';
import { calculateTotals } from '../../../core/invoice/calculator';
import type { InvoiceDraft } from '../../../core/invoice/model';
import { formatRupiah } from '../../../core/shared/money';
import { formatTanggal } from '../../../core/shared/dates';
import { sanitizeRichHtml } from '../../../core/shared/sanitize';
import type { BusinessIssuer } from '../../../core/business/issuer';
import { getDetailFields } from '../../../core/business/detail-fields';
import type { BusinessSubtypeSlug } from '../../../core/business/taxonomy';
import type {
  BlockWidth,
  InvoiceTemplate,
  TemplateBlock,
  TemplateWallpaper,
} from '../../../core/template/model';
import { visibleBlocks } from '../../../core/template/model';

type Props = {
  business: BusinessIssuer;
  invoice: InvoiceDraft;
  /**
   * Drives both the order of the blocks and every colour on the page. Pass
   * `resolveTemplate(invoice.templateId, saved)` to get a usable template even
   * when the id is missing or points at something that no longer exists.
   */
  template: InvoiceTemplate;
  /**
   * The trade whose detail fields this invoice prints — the active template's
   * type first, the profile's as fallback. Absent means no detail rows, which
   * is what built-in-only accounts see.
   */
  businessType?: BusinessSubtypeSlug | null;
  logoUrl?: string | null;
  className?: string;
};

function businessInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'N';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Wallpaper is expressed as a background *image* rather than a colour so a
 * gradient can sit behind dark text while the card's own fill stays available
 * as a fallback. `solid` uses a two-stop gradient of one colour for the same
 * reason — browsers paint `background-image` above `background-color`.
 */
function wallpaperStyle(wallpaper: TemplateWallpaper): CSSProperties {
  if (wallpaper.kind === 'solid') {
    return { backgroundImage: `linear-gradient(${wallpaper.color}, ${wallpaper.color})` };
  }
  if (wallpaper.kind === 'gradient') {
    return {
      backgroundImage: `linear-gradient(${wallpaper.angle}deg, ${wallpaper.from}, ${wallpaper.to})`,
    };
  }
  return {};
}

/**
 * A zone that only appears once the user has actually written something in it.
 * An empty rich block would otherwise leave a 20px hole in the stack.
 */
function hasContent(block: TemplateBlock, invoice: InvoiceDraft): boolean {
  switch (block.type) {
    case 'richHeader':
      return invoice.sections.header !== '';
    case 'richContent':
      return invoice.sections.content !== '';
    case 'richFooter':
      return invoice.sections.footer !== '';
    case 'notes':
      return Boolean(invoice.notes);
    default:
      return true;
  }
}

/**
 * Renders an invoice as an ordered list of blocks.
 *
 * The order, visibility and horizontal alignment come from the template; every
 * colour comes from its theme as an inline style, so two templates sharing a
 * layout still produce visibly different documents. Rich-text zones are
 * injected with `dangerouslySetInnerHTML`, so they go through
 * `sanitizeRichHtml` first — the stored row can be written by any client or
 * edited in the console, and only an allowlist stands between that HTML and
 * the page.
 */
export function InvoicePreview({
  business,
  invoice,
  template,
  businessType = null,
  logoUrl,
  className,
}: Props) {
  const theme = template.theme;
  const totals = calculateTotals({
    items: invoice.items,
    discount: invoice.discount,
    tax: invoice.tax,
  });

  // Catalogue order, filtered to the facts actually filled in. Keys the
  // current catalogue no longer lists (typed under a previous business type)
  // stay in the draft but stay hidden — switching a template never destroys
  // values, and this is the render side of that bargain.
  const detailRows = getDetailFields(businessType)
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: invoice.details[field.key]?.trim() ?? '',
      isDate: field.type === 'date',
    }))
    .filter((row) => row.value !== '');

  const muted = { color: theme.muted };
  // The letterhead names the business, not the owner behind it — the owner
  // name is only the fallback for profiles that never set one.
  const issuer = business.businessName || business.name;

  function renderBlock(block: TemplateBlock): ReactNode {
    switch (block.type) {
      case 'letterhead':
        // Side-by-side only when there is room for it: on a narrow card the
        // meta column would otherwise force the business block down to an
        // ellipsis (`War…`) while long unbreakable lines (an email) spill
        // right into it. Stacking puts each on its own line at full width, so
        // nothing truncates and nothing overlaps.
        return (
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            {/* `min-w-0` is what lets the business block shrink below its
                content width; without it the flex item floors at min-content
                and a nowrap sibling has nowhere to go. */}
            <div className="flex min-w-0 items-start gap-3">
              {logoUrl ? (
                /* The box is always 48px (`size-12`): the attributes give the
                   browser an intrinsic size so nothing shifts while the file
                   streams in, and previews stacked below the fold (the
                   template grid) no longer fetch a full-size upload. */
                <img
                  src={logoUrl}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                  className="size-12 shrink-0 rounded-control border object-contain"
                  style={{ borderColor: theme.border }}
                />
              ) : (
                <span
                  data-preview-part="initials"
                  className="flex size-12 shrink-0 items-center justify-center rounded-control text-sm font-semibold transition-colors duration-300"
                  style={{ backgroundColor: theme.accentSoft, color: theme.accent }}
                >
                  {businessInitials(issuer)}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{issuer || 'Nama usaha'}</h2>
                {business.address && (
                  <p className="mt-0.5 text-xs break-words" style={muted}>
                    {business.address}
                  </p>
                )}
                <p className="mt-0.5 text-xs" style={muted}>
                  {business.phone}
                </p>
                <p className="mt-0.5 text-xs break-words" style={muted}>
                  {business.email}
                </p>
              </div>
            </div>

            {/* The meta column must never squeeze: on a narrow card the
                business block would otherwise push the number and dates into
                one-word-per-line wraps. It keeps its width and the left side
                truncates instead. */}
            <div className="shrink-0 text-left whitespace-nowrap sm:text-right">
              <p
                data-preview-part="title"
                className="text-lg font-semibold tracking-tight transition-colors duration-300"
                style={{ color: theme.accent }}
              >
                Invoice
              </p>
              <p className="text-sm font-medium tabular-nums">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-xs" style={muted}>
                {formatTanggal(invoice.date)}
              </p>
              {invoice.dueDate && (
                <p className="text-xs" style={muted}>
                  Jatuh tempo {formatTanggal(invoice.dueDate)}
                </p>
              )}
            </div>
          </header>
        );

      case 'richHeader':
        return (
          <div
            data-rich-output
            className="notain-rich-text-preview text-sm"
            style={muted}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(invoice.sections.header) }}
          />
        );

      case 'customer':
        return (
          <section
            data-preview-part="customer-box"
            className="rounded-control border p-4 transition-colors duration-300"
            style={{ borderColor: theme.border, backgroundColor: theme.background }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={muted}>
              Untuk
            </p>
            <p className="mt-1 text-sm font-semibold">{invoice.customerName || 'Nama customer'}</p>
            {invoice.customerEmail && (
              <p className="text-xs" style={muted}>
                {invoice.customerEmail}
              </p>
            )}
            {invoice.customerPhone && (
              <p className="text-xs" style={muted}>
                {invoice.customerPhone}
              </p>
            )}
            {detailRows.length > 0 && (
              <dl
                data-preview-part="detail-rows"
                className="mt-3 space-y-1 border-t pt-2"
                style={{ borderColor: theme.border }}
              >
                {detailRows.map((row) => (
                  <div key={row.key} className="flex justify-between gap-4 text-xs">
                    <dt style={muted}>{row.label}</dt>
                    <dd className="text-right">
                      {row.isDate ? formatTanggal(row.value) : row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );

      case 'items': {
        // The unit column earns its width only when at least one row uses it —
        // most invoices have none and a permanently empty column just steals
        // space from the prices.
        const showUnit = invoice.items.some((item) => Boolean(item.unit));
        return (
          // Contained scroll: a many-column table (or a long barang name)
          // has more min-content than a phone can show inside the A4 column.
          // Without this it pushed the whole page ~100px wide at 320px;
          // `overflow-x-auto` scrolls the document preview instead. At A4
          // widths (>= 688px — the `max-w-[182mm]` article) there is room, so
          // the bar never appears and print/PDF are untouched.
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ borderBottom: `1px solid ${theme.border}`, color: theme.muted }}
                >
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    Barang
                  </th>
                  <th scope="col" className="pb-2 pl-2 text-right font-medium">
                    Jumlah
                  </th>
                  {showUnit && (
                    <th scope="col" className="pb-2 pl-2 text-left font-medium">
                      Satuan
                    </th>
                  )}
                  <th scope="col" className="pb-2 pl-2 text-right font-medium">
                    Harga
                  </th>
                  <th scope="col" className="pb-2 pl-2 text-right font-medium">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={showUnit ? 5 : 4}
                      className="py-6 text-center text-sm"
                      style={muted}
                    >
                      Belum ada barang.
                    </td>
                  </tr>
                )}
                {invoice.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {/* On a narrow preview the numeric columns would otherwise
                      touch and read as one number (`2Rp25.000Rp50.000`), so
                      every one carries its own left padding rather than
                      relying on the name column to absorb it. */}
                    <td className="py-2 pr-3">{item.name || <span style={muted}>-</span>}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{item.quantity}</td>
                    {showUnit && (
                      <td className="py-2 pl-2 text-left tabular-nums">
                        {item.unit ?? <span style={muted}>-</span>}
                      </td>
                    )}
                    <td className="py-2 pl-2 text-right tabular-nums">
                      {formatRupiah(item.unitPrice)}
                    </td>
                    <td className="py-2 pl-2 text-right font-medium tabular-nums">
                      {formatRupiah(totals.itemSubtotals[invoice.items.indexOf(item)] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'richContent':
        return (
          <div
            data-rich-output
            className="notain-rich-text-preview text-sm"
            style={muted}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(invoice.sections.content) }}
          />
        );

      case 'totals': {
        // The column is narrower than the page, so it needs a margin to decide
        // which edge it hugs — the block wrapper is full width and cannot.
        const marginInline =
          block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0';
        return (
          <dl
            className="w-full max-w-xs space-y-2 text-sm"
            style={{ marginInline, textAlign: block.align }}
          >
            <div className="flex justify-between gap-4">
              <dt style={muted}>Subtotal</dt>
              <dd className="tabular-nums">{formatRupiah(totals.subtotal)}</dd>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt style={muted}>
                  Diskon
                  {invoice.discount.type === 'percent' ? ` (${invoice.discount.value}%)` : ''}
                </dt>
                <dd className="tabular-nums text-danger">−{formatRupiah(totals.discountAmount)}</dd>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between gap-4">
                <dt style={muted}>
                  Pajak
                  {invoice.tax.type === 'percent' ? ` (${invoice.tax.value}%)` : ''}
                </dt>
                <dd className="tabular-nums">+{formatRupiah(totals.taxAmount)}</dd>
              </div>
            )}
            <div
              data-preview-part="total-row"
              className="flex justify-between gap-4 pt-2 transition-colors duration-300"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <dt className="font-semibold">Total</dt>
              <dd
                data-preview="total"
                className="font-semibold tabular-nums transition-colors duration-300"
                style={{ color: theme.accent }}
              >
                {formatRupiah(totals.grandTotal)}
              </dd>
            </div>
          </dl>
        );
      }

      case 'notes':
        return (
          <section
            data-preview-part="notes"
            className="rounded-control border p-4 text-sm transition-colors duration-300"
            style={{ borderColor: theme.border, backgroundColor: theme.background }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={muted}>
              Catatan
            </p>
            <div className="notain-markdown mt-1.5">
              <Markdown>{invoice.notes ?? ''}</Markdown>
            </div>
          </section>
        );

      case 'richFooter':
        return (
          <div
            data-rich-output
            className="notain-rich-text-preview border-t pt-4 text-sm"
            style={{ borderColor: theme.border, color: theme.muted }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(invoice.sections.footer) }}
          />
        );

      case 'divider':
        return <hr style={{ borderColor: theme.border }} />;

      case 'spacer':
        // On top of the 20px `space-y-5` gap, so it reads as extra breathing
        // room rather than an invisible zero-height block.
        return <div aria-hidden="true" className="h-4" />;
    }
  }

  const blocks = visibleBlocks(template.layout).filter((block) => hasContent(block, invoice));

  return (
    <article
      data-template={template.id}
      className={[
        'relative mx-auto w-full max-w-[182mm] border p-6 shadow-card sm:p-8',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderRadius: theme.radius,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        color: theme.text,
        ...wallpaperStyle(theme.wallpaper),
      }}
    >
      {theme.accentBar && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 block"
          style={{
            height: 3,
            backgroundColor: theme.accent,
            borderRadius: `${theme.radius}px ${theme.radius}px 0 0`,
          }}
        />
      )}

      <div className="space-y-5">
        {blocks.map((block) => (
          <div
            key={block.id}
            data-block={block.type}
            style={{ textAlign: block.align, ...widthStyle(block) }}
          >
            {renderBlock(block)}
          </div>
        ))}
      </div>
    </article>
  );
}

/**
 * How much of the page a block may occupy.
 *
 * `full` produces no inline style at all, so the default stack renders exactly
 * as it did before widths existed. The narrower buckets only set a max-width
 * and let `align` pick which side the box hugs — there is no free-positioning
 * maths here on purpose.
 */
const BLOCK_WIDTH_BOX: Record<BlockWidth, { maxWidth: string } | null> = {
  full: null,
  wide: { maxWidth: '74%' },
  narrow: { maxWidth: '48%' },
};

function widthStyle(block: TemplateBlock): CSSProperties {
  const box = BLOCK_WIDTH_BOX[block.width];
  if (!box) return {};
  const marginInline =
    block.align === 'center' ? 'auto' : block.align === 'right' ? 'auto 0' : '0 auto';
  return { maxWidth: box.maxWidth, marginInline };
}
