/**
 * `#untuk-siapa`: who the product is for, on one line.
 *
 * A shop's nota is the same document whether it is written behind a warung
 * counter or in a developer's terminal, so this is a sentence rather than a
 * band of scrolling chips: the reader gets the whole list at a glance instead
 * of waiting for the marquee to come round.
 *
 * The footer links here, so the section has to be a section: an id, a name and
 * a heading. A jump target with no title looks like a link that does nothing.
 */
export function Audience() {
  return (
    <section
      id="untuk-siapa"
      aria-labelledby="untuk-siapa-title"
      className="scroll-mt-20 border-t border-rule"
    >
      <div className="mx-auto w-full max-w-5xl px-5 py-4 sm:px-8">
        <h2 id="untuk-siapa-title" className="text-sm text-muted">
          Dipakai warung, toko online, freelancer, jasa servis, salon, katering, desainer, dan
          developer.
        </h2>
      </div>
    </section>
  );
}
