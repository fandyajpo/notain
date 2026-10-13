import { motion, MotionConfig } from 'motion/react';
import { Fragment, type ReactNode } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Kept low so tall blocks still trigger. `amount` is the fraction of the
 * element that must be visible — a generous value would strand anything taller
 * than the viewport at `opacity: 0` forever.
 */
const VIEWPORT = { once: true, amount: 0.1 } as const;

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Distance in px the element travels while fading in. */
  y?: number;
  /**
   * Adds a subtle scale to the fade. Scale and opacity are compositor-only,
   * so they stay smooth while the page scrolls — unlike `filter: blur()`,
   * which repaints every frame mid-scroll and causes visible stutter.
   */
  scale?: boolean;
};

/** Fades and lifts content into view once it enters the viewport. */
export function Reveal({ children, delay = 0, className, y = 24, scale = false }: RevealProps) {
  const hidden = scale ? { opacity: 0, y, scale: 0.97 } : { opacity: 0, y };
  const shown = scale ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0 };

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={hidden}
        whileInView={shown}
        viewport={VIEWPORT}
        transition={{ duration: 0.7, delay, ease: EASE }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

type SplitWordsProps = {
  text: string;
  className?: string;
  /** Seconds before the first word starts moving. */
  delay?: number;
  /** Seconds between consecutive words. */
  stagger?: number;
  /**
   * Renders the words already revealed instead of masked off-screen.
   *
   * Headlines inside the first viewport use this: their hidden state ships as
   * inline `transform: translateY(115%)` in the server HTML, so the page's
   * largest paint would not happen until the island hydrates. Below-the-fold
   * headlines keep the animation.
   */
  immediate?: boolean;
};

/**
 * Reveals a headline word by word from behind a clipping mask, the way a
 * typesetter would pull each word up onto the baseline.
 *
 * The observer watches the unclipped line, not the words: a word shifted to
 * `y: 115%` sits entirely outside its `overflow: hidden` parent, so its
 * intersection rect is empty and `whileInView` would never fire on it.
 *
 * The accessible text is rendered once for screen readers while every animated
 * word is hidden from them, so the headline is never read as fragments.
 */
export function SplitWords({
  text,
  className,
  delay = 0,
  stagger = 0.06,
  immediate = false,
}: SplitWordsProps) {
  const words = text.split(' ');

  return (
    <motion.span
      className={className}
      initial={immediate ? 'shown' : 'hidden'}
      whileInView="shown"
      viewport={{ once: true, amount: 0.3 }}
      variants={{
        hidden: {},
        shown: { transition: { delayChildren: delay, staggerChildren: stagger } },
      }}
    >
      <span className="sr-only">{text}</span>
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {/* The padding keeps descenders inside the clip; the negative margin
              gives the height back so the tight display leading is preserved. */}
          <span
            aria-hidden="true"
            className="inline-block overflow-hidden pb-[0.16em] -mb-[0.16em] align-bottom"
          >
            <motion.span
              className="inline-block"
              variants={{
                hidden: { y: '115%', opacity: 0 },
                shown: { y: '0%', opacity: 1, transition: { duration: 0.8, ease: EASE } },
              }}
            >
              {word}
            </motion.span>
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </motion.span>
  );
}

type SectionHeadingProps = {
  title: string;
  description?: string;
  align?: 'left' | 'center';
  delay?: number;
};

/** Section title with a mask-revealed headline and a rule that draws itself. */
export function SectionHeading({
  title,
  description,
  align = 'left',
  delay = 0,
}: SectionHeadingProps) {
  const centered = align === 'center';

  return (
    <div className={centered ? 'flex flex-col items-center text-center' : ''}>
      <Reveal scale y={18} delay={delay}>
        <h2 className="text-title">{title}</h2>
      </Reveal>

      {description && (
        <Reveal y={14} delay={delay + 0.12}>
          <p className={centered ? 'mt-3 max-w-xl text-muted' : 'mt-3 text-muted'}>{description}</p>
        </Reveal>
      )}

      <motion.span
        aria-hidden="true"
        className={`mt-5 block h-1 w-12 rounded-pill bg-accent ${centered ? 'mx-auto' : ''}`}
        initial={{ scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 1 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.6, delay: delay + 0.2, ease: EASE }}
        style={{ originX: centered ? 0.5 : 0 }}
      />
    </div>
  );
}
