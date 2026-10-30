// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { confettiBurst, confettiFromElement, prefersReducedMotion } from './confetti';

type FakeAnimation = { finished: Promise<void>; cancel: () => void };

/**
 * The stub behind the last `stubAnimate()`. The assertions keep hold of the
 * spy instead of reading it back off `Element.prototype`, which would be an
 * unbound method reference.
 */
let animateSpy: ReturnType<typeof vi.fn<typeof Element.prototype.animate>> | undefined;

function stubAnimate(): FakeAnimation[] {
  const animations: FakeAnimation[] = [];
  animateSpy = vi.fn<typeof Element.prototype.animate>(() => {
    let resolve!: () => void;
    const finished = new Promise<void>((r) => {
      resolve = r;
    });
    const entry: FakeAnimation = { finished, cancel: () => resolve() };
    animations.push(entry);
    return entry as unknown as ReturnType<typeof Element.prototype.animate>;
  });
  Element.prototype.animate = animateSpy;
  return animations;
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

const overlay = () => document.getElementById('notain-confetti');

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  stubMatchMedia(false);
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('mirrors the media query', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('confettiBurst', () => {
  it('does nothing at all for reduced-motion users', () => {
    stubMatchMedia(true);
    stubAnimate();
    confettiBurst({ x: 10, y: 10 }, { count: 20 });
    expect(overlay()).toBeNull();
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('flings one piece per count into a single overlay', () => {
    stubMatchMedia(false);
    const animations = stubAnimate();
    confettiBurst({ x: 100, y: 50 }, { count: 7 });
    const layer = overlay();
    expect(layer).not.toBeNull();
    expect(layer?.childElementCount).toBe(7);
    expect(layer?.getAttribute('aria-hidden')).toBe('true');
    expect(layer?.className).toContain('pointer-events-none');
    expect(animations).toHaveLength(7);
  });

  it('removes the overlay once every piece has finished', async () => {
    stubMatchMedia(false);
    const animations = stubAnimate();
    confettiBurst({ x: 0, y: 0 }, { count: 3 });
    animations.forEach((animation) => animation.cancel());
    await vi.waitFor(() => expect(overlay()).toBeNull());
  });
});

describe('confettiFromElement', () => {
  it('bursts from the centre of the element rect', () => {
    stubMatchMedia(false);
    stubAnimate();
    const pill = document.createElement('div');
    pill.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        width: 40,
        height: 20,
        right: 140,
        bottom: 70,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
    confettiFromElement(pill, { count: 2 });
    const pieces = overlay()?.children;
    const first = pieces?.[0] as HTMLElement | undefined;
    expect(first?.style.left).toBe('120px');
    expect(first?.style.top).toBe('60px');
  });

  it('is safe to call with nothing on screen', () => {
    stubMatchMedia(false);
    stubAnimate();
    expect(() => confettiFromElement(null)).not.toThrow();
    expect(() => confettiFromElement(undefined)).not.toThrow();
    expect(overlay()).toBeNull();

    const hidden = document.createElement('div');
    expect(() => confettiFromElement(hidden)).not.toThrow();
    expect(overlay()).toBeNull();
  });
});
