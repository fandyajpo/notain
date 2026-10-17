// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import type { InvoiceTemplate } from '../../../core/template/model';
import { TemplatePicker } from './template-picker';

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

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('TemplatePicker', () => {
  it('offers every selectable template as a card', async () => {
    await render(<TemplatePicker templates={BUILTIN_TEMPLATES} onPick={() => {}} />);

    const cards = container.querySelectorAll('button[data-template-id]');
    expect(cards).toHaveLength(BUILTIN_TEMPLATES.length);
    for (const [index, template] of BUILTIN_TEMPLATES.entries()) {
      expect(cards[index]?.getAttribute('data-template-id')).toBe(template.id);
      expect(cards[index]?.textContent).toContain(template.name);
      expect(cards[index]?.textContent).toContain('Bawaan');
    }
  });

  it('hands the picked id back to the caller', async () => {
    const onPick = vi.fn();
    await render(<TemplatePicker templates={BUILTIN_TEMPLATES} onPick={onPick} />);

    const card = container.querySelectorAll<HTMLElement>('button[data-template-id]')[1];
    await act(async () => card?.click());

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(BUILTIN_TEMPLATES[1]?.id);
  });

  it('marks the selected card so the choice is visible', async () => {
    await render(
      <TemplatePicker
        templates={BUILTIN_TEMPLATES}
        selectedId={BUILTIN_TEMPLATES[0]?.id}
        onPick={() => {}}
      />,
    );

    const cards = container.querySelectorAll('button[data-template-id]');
    expect(cards[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(cards[1]?.getAttribute('aria-pressed')).toBe('false');
  });

  it('thumbnails a real preview rather than a stand-in', async () => {
    await render(<TemplatePicker templates={BUILTIN_TEMPLATES} onPick={() => {}} />);

    // Every card lays out a genuine invoice, so the required blocks show up
    // once per template.
    for (const type of ['letterhead', 'items', 'totals']) {
      expect(container.querySelectorAll(`[data-block="${type}"]`)).toHaveLength(
        BUILTIN_TEMPLATES.length,
      );
    }
  });

  it("shows the viewer's own business in the previews, not the demo sample", async () => {
    await render(
      <TemplatePicker
        templates={BUILTIN_TEMPLATES}
        business={{
          name: 'Bengkel Fa',
          businessName: 'Bengkel Fa',
          phone: '08111111111',
          businessType: null,
          plan: 'free',
          planExpiresAt: null,
        }}
        onPick={() => {}}
      />,
    );

    for (const card of container.querySelectorAll('button[data-template-id]')) {
      expect(card.textContent).toContain('Bengkel Fa');
      expect(card.textContent).not.toContain('Warung Maju Jaya');
    }
  });

  const savedTemplate = (
    id: string,
    businessType: InvoiceTemplate['businessType'],
  ): InvoiceTemplate => ({
    ...BUILTIN_TEMPLATES[0]!,
    id,
    name: id,
    businessType,
    builtin: false,
  });

  it('stays flat when the viewer never picked a business type', async () => {
    await render(
      <TemplatePicker
        templates={[...BUILTIN_TEMPLATES, savedTemplate('row-resto', 'restoran')]}
        onPick={() => {}}
      />,
    );

    expect(document.body.textContent).not.toContain('Sesuai bisnis kamu');
    expect(document.body.textContent).not.toContain('Jenis lain');
  });

  it('groups the viewer type first without hiding the rest', async () => {
    const templates = [
      ...BUILTIN_TEMPLATES,
      savedTemplate('row-resto', 'restoran'),
      savedTemplate('row-bengkel', 'bengkel-mobil'),
    ];
    await render(
      <TemplatePicker templates={templates} businessType="restoran" onPick={() => {}} />,
    );

    expect(document.body.textContent).toContain('Sesuai bisnis kamu');
    expect(document.body.textContent).toContain('Jenis lain');
    // Every template is still offered, exactly once.
    expect(container.querySelectorAll('button[data-template-id]')).toHaveLength(templates.length);

    const sections = Array.from(document.querySelectorAll('section'));
    const matching = sections.find((section) =>
      section.textContent?.includes('Sesuai bisnis kamu'),
    );
    const others = sections.find((section) => section.textContent?.includes('Jenis lain'));
    expect(matching?.querySelectorAll('button[data-template-id]')).toHaveLength(1);
    expect(matching?.querySelector('[data-template-id="row-resto"]')).toBeTruthy();
    expect(others?.querySelector('[data-template-id="row-resto"]')).toBeNull();
    expect(others?.querySelectorAll('button[data-template-id]')).toHaveLength(templates.length - 1);
  });

  it('drops the headers when nothing matched rather than showing empty groups', async () => {
    await render(
      <TemplatePicker
        templates={[...BUILTIN_TEMPLATES, savedTemplate('row-resto', 'restoran')]}
        businessType="bengkel-mobil"
        onPick={() => {}}
      />,
    );

    expect(document.body.textContent).not.toContain('Sesuai bisnis kamu');
    expect(container.querySelectorAll('button[data-template-id]')).toHaveLength(
      BUILTIN_TEMPLATES.length + 1,
    );
  });

  it('labels a saved template with its business type', async () => {
    await render(
      <TemplatePicker
        templates={[savedTemplate('row-resto', 'restoran')]}
        businessType="restoran"
        onPick={() => {}}
      />,
    );

    const card = container.querySelector('[data-template-id="row-resto"]');
    expect(card?.textContent).toContain('Restoran');
    expect(card?.querySelector('.rounded-pill')).not.toBeNull();
  });

  it('leaves the chip off a builtin, which belongs to every trade', async () => {
    await render(
      <TemplatePicker templates={BUILTIN_TEMPLATES} businessType="restoran" onPick={() => {}} />,
    );

    for (const card of container.querySelectorAll('button[data-template-id]')) {
      expect(card.querySelector('.rounded-pill')).toBeNull();
    }
  });
});
