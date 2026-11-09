type TypingControl = HTMLInputElement | HTMLTextAreaElement;

/** Install one delegated input listener for framework-independent field feedback. */
export function installTypingFeedback(document: Document): () => void {
  const view = document.defaultView;
  if (!view) return () => undefined;

  const timers = new Map<TypingControl, number>();
  const handleInput = (event: Event) => {
    const target = event.target;
    if (
      target === null ||
      (!(target instanceof view.HTMLInputElement) &&
        !(target instanceof view.HTMLTextAreaElement))
    ) {
      return;
    }
    if (!target.classList.contains('field-control')) return;

    const previousTimer = timers.get(target);
    if (previousTimer !== undefined) view.clearTimeout(previousTimer);

    target.removeAttribute('data-typing');
    // Restart the short CSS pulse even when the user types rapidly.
    void target.offsetWidth;
    target.setAttribute('data-typing', 'true');
    timers.set(
      target,
      view.setTimeout(() => {
        target.removeAttribute('data-typing');
        timers.delete(target);
      }, 180),
    );
  };

  document.addEventListener('input', handleInput);
  return () => {
    document.removeEventListener('input', handleInput);
    for (const [control, timer] of timers) {
      view.clearTimeout(timer);
      control.removeAttribute('data-typing');
    }
    timers.clear();
  };
}
