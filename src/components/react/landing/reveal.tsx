import { motion, MotionConfig } from 'motion/react';
import { Fragment } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

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
 * This is the landing's one entrance and it belongs to the hero alone. A
 * `Reveal` wrapper used to fade and lift every section on its own, which made
 * eleven blocks perform the same small animation; the sections below the hero
 * now arrive already printed, like the rest of the sheet.
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
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
}
