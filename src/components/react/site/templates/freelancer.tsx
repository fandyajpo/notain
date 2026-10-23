import { ArrowRight, Sparkles } from 'lucide-react';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
import {
  CONTACT_FOR_PRICE,
  EmptyListNote,
  SiteFooter,
  SiteFrame,
  contactRows,
  formatItemPrice,
  siteInitials,
  splitItems,
  subtypeLabel,
  whatsappHref,
  type SitePalette,
  type SiteTemplateProps,
} from '../site-shared';

/**
 * Freelancer & Konsultan — personal brand: stone canvas, violet accent, the
 * owner's own name (or monogram) is the hero, business name sits under it in
 * serif. Services are a clean two-column list; email leads the contact block
 * because projects start there.
 */
const PALETTE: SitePalette = {
  bg: '#f7f5f2',
  surface: '#ffffff',
  ink: '#1c1917',
  muted: '#78716c',
  line: '#e7e5e4',
  accent: '#6d28d9',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-6 py-3 text-sm font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

const CTA_SMALL =
  'inline-flex shrink-0 items-center rounded-full bg-[var(--site-accent)] px-4 py-2 text-xs font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

export default function FreelancerTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);
  const { products, services } = splitItems(items);
  // The person when the profile names one, the business otherwise — a
  // freelancer's page is about whoever the client will actually talk to.
  const person = site.ownerName.trim() || site.businessName;
  const role = subtypeLabel(site) ?? INDUSTRY_LABELS.freelancer;

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <span className="truncate text-sm font-semibold">{site.businessName}</span>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA_SMALL}>
              Hubungi
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-20">
        <span
          aria-hidden="true"
          className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--site-accent)] text-3xl font-bold text-[color:var(--site-accent-ink)] sm:h-28 sm:w-28 sm:text-4xl"
        >
          {siteInitials(person)}
        </span>
        <h1 className="mt-6 text-3xl font-bold tracking-tight break-words sm:text-4xl">
          {site.businessName}
        </h1>
        {site.ownerName.trim() && site.ownerName.trim() !== site.businessName && (
          <p className="mt-2 font-serif text-2xl italic sm:text-3xl">{site.ownerName.trim()}</p>
        )}
        <p className="mt-3 text-sm font-medium tracking-wide text-[color:var(--site-accent)] uppercase">
          {role}
        </p>
        <p className="mx-auto mt-5 max-w-md text-[color:var(--site-muted)]">
          {hasList
            ? 'Layanan yang bisa dikerjakan — hubungi untuk membahas kebutuhanmu.'
            : 'Hubungi untuk membahas kebutuhanmu.'}
        </p>
        {wa && (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
              <Sparkles size={16} aria-hidden="true" /> Ajukan proyek
            </a>
            {hasList && (
              <a
                href="#layanan"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--site-line)] bg-[var(--site-surface)] px-6 py-3 text-sm font-semibold transition hover:border-[color:var(--site-accent)]"
              >
                Lihat layanan <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </section>
      <section id="layanan" className="border-t border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight">Layanan</h2>
          {hasList ? (
            <>
              <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
                {[...services, ...products].map((item) => {
                  const price = formatItemPrice(item);
                  return (
                    <li
                      key={item.name}
                      className="flex items-baseline justify-between gap-4 border-b border-[color:var(--site-line)] py-4"
                    >
                      <span className="flex min-w-0 items-baseline gap-2.5">
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--site-accent)]" />
                        <span className="truncate font-medium">{item.name}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[color:var(--site-accent)]">
                        {price?.price ?? CONTACT_FOR_PRICE}
                        {price?.per && (
                          <span className="ml-1 text-xs font-normal text-[color:var(--site-muted)]">
                            /{price.per}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <div className="mt-6">
              <EmptyListNote />
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Kontak</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {rows.map((row) => {
                const Icon = row.icon;
                const body = (
                  <span className="flex gap-3">
                    <Icon size={16} className="mt-0.5 shrink-0 text-[color:var(--site-accent)]" aria-hidden="true" />
                    <span className="break-words">{row.text}</span>
                  </span>
                );
                return (
                  <li key={row.text}>
                    {row.href ? (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--site-accent)] hover:underline">
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="text-[color:var(--site-muted)]">Belum ada kontak yang dipublikasikan.</li>
              )}
            </ul>
          </div>
          <div className="flex items-start sm:justify-end">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                Kirim brief <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
