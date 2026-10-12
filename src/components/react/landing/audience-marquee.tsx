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

/** Infinite marquee of who Notain is for — the page's "this is you" moment. */
export function AudienceMarquee() {
  const loop = [...AUDIENCES, ...AUDIENCES];

  return (
    <section
      aria-label="Cocok untuk berbagai bisnis"
      className="overflow-hidden border-y border-border bg-card py-5"
    >
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
    </section>
  );
}
