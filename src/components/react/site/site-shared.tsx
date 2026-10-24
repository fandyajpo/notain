import type { CSSProperties, ReactNode } from 'react';
import { Mail, MapPin, Phone, type LucideIcon } from 'lucide-react';
import { formatRupiah } from '../../../core/shared/money';
import { buildWhatsAppUrl } from '../../../core/whatsapp';
import { businessSubtypeLabel } from '../../../core/business/taxonomy';
import type { PublicSite, PublicSiteItem } from '../../../app/public-site';

/**
 * The pieces every industry template under `./templates/` is built from.
 *
 * A template's job is composition and styling; the data rules — what a price
 * looks like without one, how a list splits into products and services, what
 * happens when the owner never filled a field — live here so all eight
 * degrade identically. Nothing in this file invents content: sections whose
 * data does not exist are simply absent (see `EmptyListNote`, `whatsappHref`).
 */

export type SiteTemplateProps = {
  site: PublicSite;
  items: PublicSiteItem[];
};

/**
 * The colours a template paints itself with. Applied once by {@link SiteFrame}
 * as CSS custom properties (`--site-*`), so descendants reach them with
 * ordinary `var()` utilities and a whole page recolours without the DOM
 * changing shape.
 */
export type SitePalette = {
  /** Page canvas. */ bg: string;
  /** Raised surfaces: cards, bands, inputs. */ surface: string;
  /** Primary text. */ ink: string;
  /** Secondary text: captions, meta, prices' units. */ muted: string;
  /** Hairlines: borders, dividers, dotted leaders. */ line: string;
  /** Brand accent: buttons, links, highlights. */ accent: string;
  /** Text placed on an accent fill. */ accentInk: string;
};

type FrameProps = {
  palette: SitePalette;
  className?: string;
  children: ReactNode;
};

/** The page root: palette in scope, canvas and ink applied, everything after it themed. */
export function SiteFrame({ palette, className, children }: FrameProps) {
  const style = {
    '--site-bg': palette.bg,
    '--site-surface': palette.surface,
    '--site-ink': palette.ink,
    '--site-muted': palette.muted,
    '--site-line': palette.line,
    '--site-accent': palette.accent,
    '--site-accent-ink': palette.accentInk,
  } as CSSProperties;
  return (
    <div
      style={style}
      className={`min-h-screen bg-[var(--site-bg)] text-[color:var(--site-ink)] ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

/** Up to two initials from a business name — the avatar when no logo was uploaded. */
export function siteInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

type LogoProps = {
  site: PublicSite;
  /** Size classes; also the initials avatar's box when there is no logo. */
  className?: string;
};

/**
 * The brand mark: the uploaded logo when there is one, else initials on the
 * accent. `alt` names the business — a logo *is* the business name in image
 * form, so the two together are never redundant for a screen reader.
 */
export function SiteLogo({ site, className = 'h-16 w-16' }: LogoProps) {
  if (site.logoUrl) {
    return (
      <img
        src={site.logoUrl}
        alt={`Logo ${site.businessName}`}
        className={`${className} object-contain`}
        loading="lazy"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--site-accent)] text-xl font-semibold text-[color:var(--site-accent-ink)] ${className}`}
    >
      {siteInitials(site.businessName)}
    </span>
  );
}

/** The catalog split most templates need: things sold vs. services offered. */
export function splitItems(items: PublicSiteItem[]): {
  products: PublicSiteItem[];
  services: PublicSiteItem[];
} {
  const products: PublicSiteItem[] = [];
  const services: PublicSiteItem[] = [];
  for (const item of items) (item.kind === 'barang' ? products : services).push(item);
  return { products, services };
}

/**
 * A card-ready price: `null` when no price is configured (`unitPrice` is 0 —
 * the catalog form's default, i.e. "never priced here"), otherwise the amount
 * plus the per-unit suffix the owner stored. Templates render `null` as
 * "Hubungi" — showing "Rp0" would read as a real price.
 */
export function formatItemPrice(
  item: PublicSiteItem,
): { price: string; per: string | null } | null {
  if (item.unitPrice <= 0) return null;
  return { price: formatRupiah(item.unitPrice), per: item.unit ? item.unit : null };
}

/** The price slot's fallback copy when a price was never configured. */
export const CONTACT_FOR_PRICE = 'Hubungi';

/** The opening line a WhatsApp CTA sends when the caller passes no message. */
export function inquiryMessage(site: PublicSite): string {
  return `Halo ${site.businessName} 👋, saya ingin bertanya soal produk dan layanan yang tersedia.`;
}

/**
 * `wa.me` link for this business, or `null` when the profile has no phone —
 * callers must render no button at all rather than a dead one (the same
 * rule as the invoice builder's send action).
 */
export function whatsappHref(site: PublicSite, message = inquiryMessage(site)): string | null {
  return site.phone ? buildWhatsAppUrl({ phone: site.phone, message }) : null;
}

/** Maps search for an address — a query URL, so no place id is required. */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** The stored subtype's own label ("Bengkel Motor", "Katering", …), if any. */
export function subtypeLabel(site: PublicSite): string | null {
  return businessSubtypeLabel(site.businessType);
}

export type ContactRow = {
  icon: LucideIcon;
  text: string;
  /** `null` renders the row as plain text (there is nothing to open). */
  href: string | null;
};

/**
 * The contact facts that actually exist on this profile, in a fixed order.
 * Rows for fields the owner never filled are simply absent — templates map
 * this list and render nothing extra, which is what keeps every industry's
 * graceful degradation identical.
 */
export function contactRows(site: PublicSite): ContactRow[] {
  const rows: ContactRow[] = [];
  if (site.address) rows.push({ icon: MapPin, text: site.address, href: mapsHref(site.address) });
  if (site.phone) {
    rows.push({
      icon: Phone,
      text: site.phone,
      href: buildWhatsAppUrl({ phone: site.phone, message: inquiryMessage(site) }),
    });
  }
  if (site.email) rows.push({ icon: Mail, text: site.email, href: `mailto:${site.email}` });
  return rows;
}

type NoteProps = {
  className?: string;
  children?: ReactNode;
};

/**
 * Shown where a template would list products/services but the owner has none
 * published yet — honest about the missing list instead of rendering an empty
 * grid or inventing placeholder wares. Templates that need nothing else when
 * the list is empty simply omit their section instead.
 */
export function EmptyListNote({ className, children }: NoteProps) {
  return (
    <p className={`text-sm text-[color:var(--site-muted)] ${className ?? ''}`}>
      {children ??
        'Daftar belum tersedia di halaman ini. Silakan hubungi langsung untuk informasi.'}
    </p>
  );
}

type FooterProps = {
  site: PublicSite;
  className?: string;
};

/** One footer for every industry: who the page belongs to, who built the page. */
export function SiteFooter({ site, className }: FooterProps) {
  return (
    <footer
      className={`border-t border-[color:var(--site-line)] px-5 py-6 text-sm text-[color:var(--site-muted)] ${className ?? ''}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <span>
          © {new Date().getFullYear()} {site.businessName}
        </span>
        <span>
          Halaman usaha dibuat dengan{' '}
          <a href="/" className="underline underline-offset-2 hover:text-[color:var(--site-ink)]">
            Notain
          </a>
        </span>
      </div>
    </footer>
  );
}
