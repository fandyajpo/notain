import { motion, useSpring } from 'motion/react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';

const SPRING = { stiffness: 220, damping: 18, mass: 0.5 } as const;

type MagneticButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
  /** Share of the cursor offset the button follows, 0–1. */
  strength?: number;
};

/**
 * A link that leans toward the cursor while it hovers, then springs back to
 * rest. Everything is driven by motion values, so the server-rendered markup
 * carries no transform and hydration stays clean.
 */
export function MagneticButton({ href, children, className, strength = 0.3 }: MagneticButtonProps) {
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);

  const track = (event: MouseEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * strength);
    y.set((event.clientY - rect.top - rect.height / 2) * strength);
  };

  const release = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      href={href}
      style={{ x, y }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.95 }}
      onMouseMove={track}
      onMouseLeave={release}
      className={className}
    >
      {children}
    </motion.a>
  );
}

type TiltCardProps = {
  children: ReactNode;
  className?: string;
  /** Maximum rotation in degrees at the edge of the card. */
  max?: number;
};

/**
 * Perspective tilt that follows the pointer. Touch pointers are ignored so the
 * card never fights the page's own scrolling.
 */
export function TiltCard({ children, className, max = 9 }: TiltCardProps) {
  const rotateX = useSpring(0, SPRING);
  const rotateY = useSpring(0, SPRING);

  const track = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(-py * max * 2);
    rotateY.set(px * max * 2);
  };

  const release = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      className={className}
      onPointerMove={track}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      <motion.div style={{ rotateX, rotateY, transformPerspective: 1400 }}>{children}</motion.div>
    </div>
  );
}
