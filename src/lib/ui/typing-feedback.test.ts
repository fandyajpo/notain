// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { installTypingFeedback } from './typing-feedback';

let uninstall: (() => void) | undefined;

beforeEach(() => {
  document.body.innerHTML = '';
  uninstall = installTypingFeedback(document);
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('installTypingFeedback', () => {
  it('pulses shared inputs and textareas, then clears the feedback', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const unrelated = document.createElement('input');
    input.className = 'field-control';
    textarea.className = 'field-control';
    document.body.append(input, textarea, unrelated);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    unrelated.dispatchEvent(new Event('input', { bubbles: true }));

    expect(input.getAttribute('data-typing')).toBe('true');
    expect(textarea.getAttribute('data-typing')).toBe('true');
    expect(unrelated.hasAttribute('data-typing')).toBe(false);

    vi.advanceTimersByTime(180);
    expect(input.hasAttribute('data-typing')).toBe(false);
    expect(textarea.hasAttribute('data-typing')).toBe(false);
  });

  it('keeps the pulse active while the user continues typing', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.className = 'field-control';
    document.body.append(input);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(120);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(120);

    expect(input.getAttribute('data-typing')).toBe('true');
    vi.advanceTimersByTime(60);
    expect(input.hasAttribute('data-typing')).toBe(false);
  });
});
