// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { useUnsavedChangesGuard, type UnsavedChangesGuard } from './use-unsaved-changes-guard';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;
let guard: UnsavedChangesGuard;

function Probe({ when }: { when: boolean }) {
  guard = useUnsavedChangesGuard(when);
  return null;
}

async function renderProbe(when: boolean) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Probe when={when} />);
  });
}

async function dispatchNav(path = '/dashboard') {
  const event = new Event('astro:before-preparation', { cancelable: true });
  (event as Event & { to: URL }).to = new URL(`https://notain.test${path}`);
  // Flushing inside `act` lets the state update land, so `guard` re-reads.
  await act(async () => {
    document.dispatchEvent(event);
  });
  return event;
}

function dispatchBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('useUnsavedChangesGuard', () => {
  it('holds an in-app navigation while armed', async () => {
    await renderProbe(true);

    const event = await dispatchNav('/invoices');

    expect(event.defaultPrevented).toBe(true);
    expect(guard.isPrompting).toBe(true);
  });

  it('lets navigation through when not armed', async () => {
    await renderProbe(false);

    const event = await dispatchNav();

    expect(event.defaultPrevented).toBe(false);
    expect(guard.isPrompting).toBe(false);
  });

  it('prompts on a hard exit while armed', async () => {
    await renderProbe(true);

    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
  });

  it('stops prompting after disarm', async () => {
    await renderProbe(true);

    act(() => guard.disarm());

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    expect((await dispatchNav()).defaultPrevented).toBe(false);
  });

  it('cancelling a held navigation clears the prompt without navigating', async () => {
    await renderProbe(true);

    await dispatchNav();
    expect(guard.isPrompting).toBe(true);

    act(() => guard.cancelLeave());
    expect(guard.isPrompting).toBe(false);
  });
});
