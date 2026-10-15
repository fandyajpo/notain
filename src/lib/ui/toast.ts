export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

const CONTAINER_ID = 'notain-toasts';
const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

const ICONS: Record<ToastVariant, string> = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
};

const TONE: Record<ToastVariant, string> = {
  success: 'text-accent',
  error: 'text-danger',
  info: 'text-muted',
};

const BORDER: Record<ToastVariant, string> = {
  success: 'border-accent/25',
  error: 'border-danger/25',
  info: 'border-border',
};

function ensureContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;

  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  // Above modals (z-50): a toast often *explains* a failed modal submit.
  container.className =
    'pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

function removeToast(element: HTMLElement): void {
  element.classList.add('opacity-0');
  window.setTimeout(() => element.remove(), 200);
}

export function toast(message: string, options: ToastOptions = {}): void {
  if (typeof document === 'undefined') return;

  const { variant = 'info', duration = DEFAULT_DURATION } = options;
  const container = ensureContainer();

  const element = document.createElement('div');
  element.className = [
    'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-control border bg-card px-4 py-3 shadow-popover',
    'transition-all duration-200',
    TONE[variant],
    BORDER[variant],
  ].join(' ');

  element.innerHTML = `${ICONS[variant]}<p class="flex-1 text-sm text-foreground whitespace-pre-line">${escapeHtml(message)}</p>`;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'rounded-control p-1 text-muted hover:text-foreground focus-ring';
  close.setAttribute('aria-label', 'Tutup notifikasi');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="size-4" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
  close.addEventListener('click', () => removeToast(element));

  element.appendChild(close);

  while (container.children.length >= MAX_VISIBLE) {
    container.firstElementChild?.remove();
  }

  container.appendChild(element);
  window.setTimeout(() => removeToast(element), duration);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
