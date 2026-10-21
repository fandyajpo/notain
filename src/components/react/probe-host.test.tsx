// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { ProbeHost } from './probe-host';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ProbeHost />);
  });
  // Islands hydrate on a microtask (Svelte) and a tick (Vue).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(island: Element, selector: string) {
  const button = island.querySelector(selector);
  expect(button, `expected ${selector}`).toBeTruthy();
  await act(async () => {
    (button as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function logLines(): string[] {
  return [...container.querySelectorAll('[data-probe-log] li')].map((node) =>
    (node.textContent ?? '').trim(),
  );
}

function island(name: 'svelte' | 'vue' | 'solid'): Element {
  const node = container.querySelector(`notain-probe-${name}`);
  expect(node, `expected <notain-probe-${name}>`).toBeTruthy();
  return node as Element;
}

beforeEach(async () => {
  await mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('framework islands', () => {
  it.each(['svelte', 'vue', 'solid'] as const)('%s renders React-pushed props', async (name) => {
    const element = island(name);
    expect(element.querySelector('[data-probe-label]')?.textContent?.trim()).toBe(
      name === 'svelte' ? 'Svelte' : name === 'vue' ? 'Vue' : 'Solid',
    );
    expect(element.querySelector('[data-probe-count]')?.textContent).toContain('1 rows');
  });

  it.each(['svelte', 'vue', 'solid'] as const)(
    '%s emits a contract-valid itemschange event',
    async (name) => {
      await click(island(name), `[data-probe="${name}-items"]`);
      expect(logLines()).toContain(`${name} items 1`);
    },
  );

  it.each(['svelte', 'vue', 'solid'] as const)(
    '%s emits a contract-valid pick event',
    async (name) => {
      await click(island(name), `[data-probe="${name}-pick"]`);
      const expected = name === 'solid' ? 'product' : 'customer';
      expect(logLines()).toContain(`${name} ${expected}`);
    },
  );
});
