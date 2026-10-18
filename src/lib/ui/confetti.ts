/**
 * Tiny dependency-free confetti for the app's few celebratory moments
 * (first invoice, "Lunas", setup complete).
 *
 * Vanilla DOM + the Web Animations API — the same no-library approach as
 * `toast.ts`. Each piece is an absolutely-positioned span inside one fixed
 * overlay, flung on a short ballistic arc and removed when its animation
 * finishes. Honours `prefers-reduced-motion` by doing nothing at all.
 */

export type ConfettiOrigin = {
  x: number;
  y: number;
};

export type ConfettiOptions = {
  /** How many pieces to fling. */
  count?: number;
  /** Width of the burst cone in degrees (0 = a straight upward jet). */
  spread?: number;
  /** Piece colors; defaults to the brand tokens so confetti stays on-palette. */
  colors?: string[];
  /** Horizontal reach in px — bigger feels like a cannon, smaller like a sprinkle. */
  distance?: number;
};

const OVERLAY_ID = 'notain-confetti';
const OVERLAY_CLASS = 'pointer-events-none fixed inset-0 z-[120]';
const DEFAULT_COLORS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)'];

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function ensureOverlay(): HTMLElement {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) return existing;

  const layer = document.createElement('div');
  layer.id = OVERLAY_ID;
  layer.className = OVERLAY_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

function retirePiece(piece: HTMLElement, layer: HTMLElement): void {
  piece.remove();
  if (layer.childElementCount === 0) layer.remove();
}

/**
 * Flings a cone of pieces upward from `origin` (viewport coordinates), which
 * then tumble down and fade out. A no-op for reduced-motion users and in
 * environments without the Web Animations API (jsdom, very old browsers).
 */
export function confettiBurst(origin: ConfettiOrigin, options: ConfettiOptions = {}): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  if (typeof Element.prototype.animate !== 'function') return;

  const { count = 40, spread = 110, colors = DEFAULT_COLORS, distance = 140 } = options;
  const layer = ensureOverlay();

  for (let index = 0; index < count; index += 1) {
    const angle = ((-90 - spread / 2 + Math.random() * spread) * Math.PI) / 180;
    const reach = distance * (0.5 + Math.random() * 0.5);
    const dx = Math.cos(angle) * reach;
    // Sine is negative for upward angles on screen (y grows downward).
    const dy = Math.sin(angle) * reach;
    const fall = 320 + Math.random() * 220;
    const spin = (Math.random() * 2 - 1) * 720;
    const duration = 1000 + Math.random() * 600;
    const width = 5 + Math.random() * 4;
    const color = colors[index % colors.length] ?? DEFAULT_COLORS[0];

    const piece = document.createElement('span');
    piece.style.position = 'absolute';
    piece.style.left = `${origin.x}px`;
    piece.style.top = `${origin.y}px`;
    piece.style.width = `${width}px`;
    piece.style.height = `${width * 0.6}px`;
    piece.style.borderRadius = '1px';
    piece.style.background = color ?? '';
    layer.appendChild(piece);

    const animation = piece.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin * 0.6}deg)`,
          opacity: 1,
          offset: 0.4,
        },
        {
          transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + fall}px)) rotate(${spin}deg)`,
          opacity: 0,
        },
      ],
      { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    );
    void animation.finished.then(() => retirePiece(piece, layer));
  }
}

/** `confettiBurst` centred on an element's viewport rect (the pill that just said "Lunas"). */
export function confettiFromElement(
  element: Element | null | undefined,
  options?: ConfettiOptions,
): void {
  if (!element || typeof element.getBoundingClientRect !== 'function') return;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  confettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, options);
}
