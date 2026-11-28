import {
  Briefcase,
  Coffee,
  CookingPot,
  Cpu,
  Frame,
  Scissors,
  ShoppingBag,
  Wrench,
} from 'lucide-react';

const AUDIENCES = [
  { label: 'Warung', icon: Coffee },
  { label: 'Online shop', icon: ShoppingBag },
  { label: 'Freelancer', icon: Briefcase },
  { label: 'Jasa servis', icon: Wrench },
  { label: 'Salon & barbershop', icon: Scissors },
  { label: 'Katering', icon: CookingPot },
  { label: 'Desainer', icon: Frame },
  { label: 'Developer', icon: Cpu },
];

/**
 * `#untuk-siapa`: who the product is for, as a band that scrolls itself.
 *
 * The footer links here, so the section has to be a section: an id, a name and
 * a heading. A jump target with no title looks like a link that does nothing.
 */
export function AudienceMarquee() {
  const loop = [...AUDIENCES, ...AUDIENCES];

  return (
    <section
      id="untuk-siapa"
      aria-labelledby="untuk-siapa-title"
      className="scroll-mt-24 border-y border-border bg-card py-8"
    >
      <h2
        id="untuk-siapa-title"
        className="mx-auto w-full max-w-6xl px-5 text-section text-muted sm:px-8"
      >
        Dipakai dari warung sampai developer.
      </h2>

      {/* The mask sits on a still parent, not on the moving track: a mask on
          the track would travel with it. Chips fade out at both edges instead
          of being sliced mid-word by the section's edge. */}
      <div className="mt-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-[marquee_38s_linear_infinite] will-change-transform hover:[animation-play-state:paused]">
          {loop.map(({ label, icon: Icon }, index) => (
            <div
              key={`${label}-${index}`}
              aria-hidden={index >= AUDIENCES.length}
              className="flex items-center gap-3 border-r border-border px-8"
            >
              <Icon size={17} aria-hidden="true" className="shrink-0 text-accent" />
              <span className="whitespace-nowrap text-sm font-medium text-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
