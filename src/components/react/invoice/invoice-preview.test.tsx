// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createSampleInvoice } from '../../../core/invoice/sample';
import type { InvoiceDraft } from '../../../core/invoice/model';
import type { BusinessIssuer } from '../../../core/business/issuer';
import type { InvoiceTemplate } from '../../../core/template/model';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { resolveTemplate } from '../../../core/template/resolve';
import { InvoicePreview } from './invoice-preview';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

async function render(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

function setup(mutate?: (draft: InvoiceDraft) => void): {
  business: BusinessIssuer;
  draft: InvoiceDraft;
} {
  const sample = createSampleInvoice();
  mutate?.(sample.draft);
  return sample;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('InvoicePreview rich-text zones', () => {
  it('renders the sections the editor produced', async () => {
    const { business, draft } = setup();

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    expect(container.querySelector('[data-preview-part="notes"]')).not.toBeNull();
    expect(container.textContent).toContain('Terima kasih sudah memesan di Warung Maju Jaya.');
    expect(container.innerHTML).toContain('<strong>Pembayaran:</strong>');
  });

  it('wraps the notes markdown in the styled hook, not a bare div', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.notes = 'Bayar dulu ya.\n\n- satu\n- dua';
    });

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    const notes = container.querySelector('[data-preview-part="notes"]');
    const markdown = notes?.querySelector('.notain-markdown');
    expect(markdown).not.toBeNull();
    // The markdown actually rendered into real elements the CSS targets.
    expect(markdown?.querySelectorAll('li')).toHaveLength(2);
  });

  it('never lets injected elements or handlers reach the page', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.sections.header =
        '<p onclick="alert(1)">Header aman</p><script>alert(1)</script>' +
        '<img src=x onerror="alert(1)"><style>body{display:none}</style>';
      invoice.sections.content =
        '<iframe src="https://evil.test"></iframe>' +
        '<a href="javascript:alert(1)">klik saya</a>' +
        '<svg onload="alert(1)"></svg>';
      invoice.sections.footer =
        '<div style="position:fixed" onmouseover="alert(1)">Footer aman</div>';
    });

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    const zones = container.querySelectorAll('[data-rich-output]');
    expect(zones).toHaveLength(3);

    for (const zone of zones) {
      for (const selector of [
        'script',
        'img',
        'iframe',
        'svg',
        'style',
        '[onclick]',
        '[onmouseover]',
        '[style]',
        'a[href]',
      ]) {
        expect(zone.querySelector(selector), selector).toBeNull();
      }
    }
    // The harmless text around the payload survives.
    expect(container.textContent).toContain('Header aman');
    expect(container.textContent).toContain('Footer aman');
    expect(container.textContent).toContain('klik saya');
  });
});

describe('InvoicePreview block layout', () => {
  function renderedBlocks(): (string | null)[] {
    return [...container.querySelectorAll('[data-block]')].map((el) =>
      el.getAttribute('data-block'),
    );
  }

  function clone(template: InvoiceTemplate): InvoiceTemplate {
    return structuredClone(template);
  }

  it('renders blocks in the order the template declares', async () => {
    const { business, draft } = setup();
    const template = clone(BUILTIN_TEMPLATES[0]);
    template.layout.reverse();

    await render(<InvoicePreview business={business} invoice={draft} template={template} />);

    expect(renderedBlocks()).toEqual([
      'richFooter',
      'notes',
      'totals',
      'richContent',
      'items',
      'customer',
      'richHeader',
      'letterhead',
    ]);
  });

  it('omits blocks the template switched off', async () => {
    const { business, draft } = setup();
    const template = clone(BUILTIN_TEMPLATES[0]);
    template.layout = template.layout.filter((block) => block.type !== 'notes');

    await render(<InvoicePreview business={business} invoice={draft} template={template} />);

    expect(renderedBlocks()).not.toContain('notes');
    expect(container.querySelector('[data-preview-part="notes"]')).toBeNull();
  });

  it('skips a rich zone the user has not written anything in', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.sections.content = '';
    });

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    expect(renderedBlocks()).not.toContain('richContent');
    // The two zones that do have content survive.
    expect(container.querySelectorAll('[data-rich-output]')).toHaveLength(2);
  });

  it('honours horizontal alignment', async () => {
    const { business, draft } = setup();
    const template = clone(BUILTIN_TEMPLATES[0]);
    const totals = template.layout.find((block) => block.type === 'totals');
    expect(totals?.align).toBe('right');

    await render(<InvoicePreview business={business} invoice={draft} template={template} />);

    const totalsBlock = container.querySelector('[data-block="totals"] > dl');
    expect(totalsBlock?.getAttribute('style')).toContain('margin-inline: auto 0');

    totals!.align = 'center';
    await act(async () => {
      root?.render(<InvoicePreview business={business} invoice={draft} template={template} />);
    });
    expect(container.querySelector('[data-block="totals"] > dl')?.getAttribute('style')).toContain(
      'margin-inline: auto;',
    );
  });

  it('carries the theme colours into the DOM', async () => {
    const { business, draft } = setup();

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('modern')} />,
    );

    const article = container.querySelector('article');
    expect(article?.getAttribute('data-template')).toBe('modern');
    expect(article?.getAttribute('style')).toContain('border-radius: 4px');
    // The accent rule across the top, rounded to match the card.
    expect(container.querySelector('article > span[aria-hidden]')?.getAttribute('style')).toContain(
      'border-radius: 4px 4px 0 0',
    );
    expect(
      container.querySelector('[data-preview-part="title"]')?.getAttribute('style'),
      // jsdom normalises hex to rgb() when it serialises the style back out.
    ).toContain('color: rgb(37, 99, 235)');
  });
});

describe('InvoicePreview block width and wallpaper', () => {
  function clone(template: InvoiceTemplate): InvoiceTemplate {
    return JSON.parse(JSON.stringify(template)) as InvoiceTemplate;
  }

  it('leaves a full-width block with no box styles', async () => {
    const { business, draft } = setup();

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    expect(
      container.querySelector('[data-block="letterhead"]')?.getAttribute('style'),
    ).not.toContain('max-width');
  });

  it('shrinks a narrow block and hugs the side it is aligned to', async () => {
    const { business, draft } = setup();
    const template = clone(BUILTIN_TEMPLATES[0]);
    const totals = template.layout.find((block) => block.type === 'totals');
    expect(totals).toBeDefined();
    totals!.width = 'narrow';

    await render(<InvoicePreview business={business} invoice={draft} template={template} />);

    const style = container.querySelector('[data-block="totals"]')?.getAttribute('style') ?? '';
    expect(style).toContain('max-width: 48%');
    expect(style).toContain('margin-inline: auto 0');
  });

  it('paints the wallpaper behind the card', async () => {
    const { business, draft } = setup();
    const template = clone(BUILTIN_TEMPLATES[0]);
    template.theme = {
      ...template.theme,
      wallpaper: { kind: 'gradient', from: '#112233', to: '#ffffff', angle: 135 },
    };

    await render(<InvoicePreview business={business} invoice={draft} template={template} />);

    const style = container.querySelector('article')?.getAttribute('style') ?? '';
    expect(style).toContain('background-image');
    expect(style).toContain('linear-gradient(135deg');
  });
});

describe('InvoicePreview unit column', () => {
  function headers(): string[] {
    return [...container.querySelectorAll('[data-block="items"] th')].map(
      (th) => th.textContent?.trim() ?? '',
    );
  }

  it('keeps four columns while no item carries a unit', async () => {
    const { business, draft } = setup();

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    expect(headers()).not.toContain('Satuan');
    expect(headers()).toEqual(['Barang', 'Jumlah', 'Harga', 'Subtotal']);
  });

  it('shows the column as soon as one row uses it, with a dash where a row has none', async () => {
    const { business, draft } = setup((invoice) => {
      const second = invoice.items[1];
      if (second) second.unit = 'gelas';
    });

    await render(
      <InvoicePreview business={business} invoice={draft} template={resolveTemplate('classic')} />,
    );

    expect(headers()).toEqual(['Barang', 'Jumlah', 'Satuan', 'Harga', 'Subtotal']);

    const rows = container.querySelectorAll('[data-block="items"] tbody tr');
    // The seeded sample rows have no unit, so they read as a deliberate dash.
    expect(rows[0]?.querySelectorAll('td')[2]?.textContent?.trim()).toBe('-');
    expect(rows[1]?.querySelectorAll('td')[2]?.textContent?.trim()).toBe('gelas');
  });
});

describe('InvoicePreview detail rows', () => {
  it('prints the filled detail facts under the customer block', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.details = { 'nama-kendaraan': 'Avanza', 'nomor-polisi': 'B 1234 XY' };
    });

    await render(
      <InvoicePreview
        business={business}
        invoice={draft}
        template={resolveTemplate('classic')}
        businessType="bengkel-mobil"
      />,
    );

    const rows = container.querySelector('[data-preview-part="detail-rows"]');
    expect(rows).not.toBeNull();
    const text = rows?.textContent ?? '';
    expect(text).toContain('Nama kendaraan');
    expect(text).toContain('Avanza');
    expect(text).toContain('Nomor polisi');
    expect(text).toContain('B 1234 XY');
  });

  it('skips facts the user left empty and hides the whole block when all are', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.details = { 'nama-kendaraan': 'Avanza', 'nomor-polisi': '  ' };
    });

    await render(
      <InvoicePreview
        business={business}
        invoice={draft}
        template={resolveTemplate('classic')}
        businessType="bengkel-mobil"
      />,
    );

    const rows = container.querySelector('[data-preview-part="detail-rows"]');
    expect(rows?.textContent).toContain('Avanza');
    expect(rows?.textContent ?? '').not.toContain('Nomor polisi');

    const empty = setup((invoice) => {
      invoice.details = {};
    });
    await act(async () => {
      root?.render(
        <InvoicePreview
          business={empty.business}
          invoice={empty.draft}
          template={resolveTemplate('classic')}
          businessType="bengkel-mobil"
        />,
      );
    });
    expect(container.querySelector('[data-preview-part="detail-rows"]')).toBeNull();
  });

  it('formats a date fact through the Indonesian date formatter', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.details = { 'tanggal-acara': '2026-10-01' };
    });

    await render(
      <InvoicePreview
        business={business}
        invoice={draft}
        template={resolveTemplate('classic')}
        businessType="katering"
      />,
    );

    const text = container.querySelector('[data-preview-part="detail-rows"]')?.textContent ?? '';
    expect(text).toContain('Tanggal acara');
    // `formatTanggal` renders ISO dates in Indonesian long form.
    expect(text).toMatch(/Oktober/);
  });

  it('hides facts whose key the current catalogue does not list', async () => {
    const { business, draft } = setup((invoice) => {
      invoice.details = { 'nomor-tiket': 'T-001', 'nama-kendaraan': 'Avanza' };
    });

    await render(
      <InvoicePreview
        business={business}
        invoice={draft}
        template={resolveTemplate('classic')}
        businessType="laundry"
      />,
    );

    const text = container.querySelector('[data-preview-part="detail-rows"]')?.textContent ?? '';
    expect(text).toContain('T-001');
    // Typed under a previous business type: kept in the draft, hidden here.
    expect(text).not.toContain('Avanza');
  });
});
