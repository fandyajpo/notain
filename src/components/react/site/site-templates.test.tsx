// @vitest-environment jsdom
import { act, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import type { PublicSite, PublicSiteItem } from '../../../app/public-site';
import type { SiteTemplateProps } from './site-shared';
import CateringTemplate from './templates/catering';
import DesignerTemplate from './templates/designer';
import DeveloperTemplate from './templates/developer';
import WarungTemplate from './templates/warung';
import OnlineShopTemplate from './templates/online-shop';
import FreelancerTemplate from './templates/freelancer';
import RepairTemplate from './templates/repair';
import SalonTemplate from './templates/salon';
import GeneralTemplate from './templates/general';

/**
 * The nine industry skins, exercised against the two payloads that matter:
 * a complete profile (every contact field, priced items) and the minimum a
 * page can exist with (a name and nothing else). The second one is the
 * contract that keeps a half-filled profile from shipping broken markup —
 * no dead WhatsApp/maps/mail links, no "Rp0" where no price was configured,
 * no empty lists.
 */

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

const FULL_SITE: PublicSite = {
  businessName: 'Warung Uji Coba',
  ownerName: 'Fandy Ahmad',
  phone: '081234567890',
  address: 'Jl. Melati No. 12, Bandung',
  email: 'halo@ujicoba.test',
  businessType: 'warung-makan',
};

const FULL_ITEMS: PublicSiteItem[] = [
  { name: 'Nasi Goreng', kind: 'barang', unit: 'porsi', unitPrice: 25_000 },
  { name: 'Jasa Antar', kind: 'jasa', unitPrice: 10_000 },
  { name: 'Es Teh', kind: 'barang', unit: 'gelas', unitPrice: 0 },
];

const BARE_SITE: PublicSite = {
  businessName: 'Toko Minim',
  ownerName: '',
  businessType: null,
};

const TEMPLATES: Array<{ id: string; Template: ComponentType<SiteTemplateProps> }> = [
  { id: 'catering', Template: CateringTemplate },
  { id: 'designer', Template: DesignerTemplate },
  { id: 'developer', Template: DeveloperTemplate },
  { id: 'warung', Template: WarungTemplate },
  { id: 'online-shop', Template: OnlineShopTemplate },
  { id: 'freelancer', Template: FreelancerTemplate },
  { id: 'repair', Template: RepairTemplate },
  { id: 'salon', Template: SalonTemplate },
  { id: 'general', Template: GeneralTemplate },
];

function text(): string {
  return container.textContent ?? '';
}

describe('industry templates', () => {
  for (const { id, Template } of TEMPLATES) {
    describe(id, () => {
      it('leads with the business name and a single h1', async () => {
        await render(<Template site={FULL_SITE} items={FULL_ITEMS} />);

        expect(text()).toContain('Warung Uji Coba');
        expect(container.querySelectorAll('h1')).toHaveLength(1);
      });

      it('exposes every contact channel the profile has', async () => {
        await render(<Template site={FULL_SITE} items={FULL_ITEMS} />);

        expect(container.querySelector('a[href*="wa.me"]')).not.toBeNull();
        expect(container.querySelector('a[href*="google.com/maps"]')).not.toBeNull();
        expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
        // Prices configured on items render formatted, unconfigured ones don't.
        expect(text()).toContain('25.000');
        expect(text()).toContain('10.000');
        expect(text()).not.toContain('Rp0');
      });

      it('renders nothing dead when the profile is a name only', async () => {
        await render(<Template site={BARE_SITE} items={[]} />);

        expect(text()).toContain('Toko Minim');
        expect(container.querySelector('a[href*="wa.me"]')).toBeNull();
        expect(container.querySelector('a[href*="google.com/maps"]')).toBeNull();
        expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
        expect(text()).not.toContain('Rp0');
        // No half-rendered list: every list that exists has entries.
        for (const list of container.querySelectorAll('ul, ol')) {
          expect(list.children.length).toBeGreaterThan(0);
        }
        // No raw "undefined"/"null" leaked into copy.
        expect(text()).not.toMatch(/\b(undefined|null)\b/);
      });

      it('keeps its own palette instead of inheriting a sibling', async () => {
        await render(<Template site={BARE_SITE} items={[]} />);

        const frame = container.firstElementChild as HTMLElement | null;
        const accent = frame?.style.getPropertyValue('--site-accent') ?? '';
        const bg = frame?.style.getPropertyValue('--site-bg') ?? '';
        expect(accent).not.toBe('');
        expect(bg).not.toBe('');
      });
    });
  }

  it('gives every industry a visually distinct accent and canvas', async () => {
    const accents = new Set<string>();
    const backgrounds = new Set<string>();
    for (const { Template } of TEMPLATES) {
      await render(<Template site={BARE_SITE} items={[]} />);
      const frame = container.firstElementChild as HTMLElement | null;
      accents.add(frame?.style.getPropertyValue('--site-accent') ?? '');
      backgrounds.add(frame?.style.getPropertyValue('--site-bg') ?? '');
      act(() => root?.unmount());
    }
    expect(accents.size).toBe(TEMPLATES.length);
    expect(backgrounds.size).toBe(TEMPLATES.length);
  });
});
