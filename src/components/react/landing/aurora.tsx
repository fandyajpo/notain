import { motion } from 'motion/react';

const BLOBS = [
  { className: '-left-24 -top-32 size-[26rem] bg-accent/20', duration: 26, delay: 0 },
  { className: '-right-28 top-8 size-[20rem] bg-warning/15', duration: 21, delay: -6 },
  { className: 'left-1/3 -bottom-36 size-[22rem] bg-accent/10', duration: 31, delay: -13 },
];

/**
 * Soft drifting color blobs behind a hero section — the landing page's gradient
 * identity. Shared by the homepage hero and the pricing hero so both read as
 * one brand. The graph-paper texture lives on the page, not here.
 */
export function Aurora() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
      aria-hidden="true"
    >
      {BLOBS.map((blob) => (
        <motion.div
          key={blob.className}
          className={`absolute rounded-full blur-3xl will-change-transform ${blob.className}`}
          animate={{ x: [0, 45, -35, 0], y: [0, -35, 25, 0], scale: [1, 1.18, 0.92, 1] }}
          transition={{
            duration: blob.duration,
            delay: blob.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}
