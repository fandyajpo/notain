const DIALOG_SELECTOR = 'dialog[data-notain-modal]';

let bound = false;

function getDialog(id: string): HTMLDialogElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLDialogElement ? element : null;
}

export function openModal(id: string): void {
  const dialog = getDialog(id);
  if (dialog && !dialog.open) {
    dialog.showModal();
    dialog.scrollTop = 0;
  }
}

export function closeModal(id: string): void {
  const dialog = getDialog(id);
  if (dialog?.open) dialog.close();
}

export function initModals(): void {
  if (bound || typeof document === 'undefined') return;
  bound = true;

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const opener = target.closest<HTMLElement>('[data-modal-open]');
    if (opener) {
      const id = opener.getAttribute('data-modal-open');
      if (id) openModal(id);
      return;
    }

    const closer = target.closest<HTMLElement>('[data-modal-close]');
    if (closer) {
      const dialog = closer.closest('dialog');
      if (dialog instanceof HTMLDialogElement) dialog.close();
      return;
    }

    if (target.matches(DIALOG_SELECTOR) && target instanceof HTMLDialogElement) {
      const rect = target.getBoundingClientRect();
      const outside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (outside) target.close();
    }
  });
}
