import { expect, test } from '@playwright/test';

/**
 * Browser proof for the cross-framework custom element boundary.
 *
 * These are the four things jsdom cannot verify, and the reason Playwright was
 * adopted (docs/architecture/playwright.md):
 *   1. customElements.define + async connectedCallback really run
 *   2. CustomEvents really bubble from an inner element to the host
 *   3. Tailwind really styles light-DOM island content
 *   4. All three frameworks coexist on one page in a real browser
 *
 * `/probes` is Appwrite-free: the pickers are fed local fixtures, so this spec
 * needs no network beyond the dev server.
 */

const PROBES = ['svelte', 'vue', 'solid'] as const;

test.describe('custom element boundary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/probes');
  });

  test('all three frameworks register and mount their custom elements', async ({ page }) => {
    // Wait for rendered content first: this is the async connectedCallback
    // path, and `page.goto` only waits for `load` — the island scripts are
    // still loading at that point. A bare evaluate here would race them.
    for (const name of PROBES) {
      await expect(page.locator(`notain-probe-${name} [data-probe-label]`)).toHaveText(
        name === 'svelte' ? 'Svelte' : name === 'vue' ? 'Vue' : 'Solid',
      );
    }

    // Only once they rendered: the elements are really defined, not just
    // present in the DOM as unknown tags.
    const defined = await page.evaluate(
      (tags) => tags.every((tag) => Boolean(customElements.get(tag))),
      [
        'notain-probe-svelte',
        'notain-probe-vue',
        'notain-probe-solid',
        'notain-items-grid',
        'notain-picker',
        'notain-calc-inspector',
      ],
    );
    expect(defined).toBe(true);
  });

  test('CustomEvents bubble from an inner element up to the React host', async ({ page }) => {
    const log = page.locator('[data-probe-log] li');

    // Dispatched on an inner button, must reach the host React is listening on.
    await page.locator('[data-probe="svelte-items"]').click();
    await expect(log.filter({ hasText: 'svelte items 1' })).toHaveCount(1);

    await page.locator('[data-probe="vue-pick"]').click();
    await expect(log.filter({ hasText: 'vue customer' })).toHaveCount(1);

    await page.locator('[data-probe="solid-pick"]').click();
    await expect(log.filter({ hasText: 'solid product' })).toHaveCount(1);
  });

  test('Tailwind styles island content (light DOM, no shadow root)', async ({ page }) => {
    // If any island were in a shadow root, the global stylesheet would not
    // reach it and these computed styles would be the UA defaults.
    // Wait for the buttons first — they only exist once the island connected.
    await expect(page.locator('notain-probe-svelte [data-probe="svelte-items"]')).toBeVisible();

    const styled = await page.evaluate(() => {
      const probes = [
        ...document.querySelectorAll('notain-probe-svelte, notain-probe-vue, notain-probe-solid'),
      ];
      const buttons = probes
        .map((probe) => probe.querySelector('button'))
        .filter((button): button is HTMLButtonElement => button !== null);
      return buttons.map((button) => {
        const style = getComputedStyle(button);
        return {
          padding: style.padding,
          borderRadius: style.borderTopLeftRadius,
          fontSize: style.fontSize,
        };
      });
    });

    expect(styled.length).toBeGreaterThan(0);
    for (const button of styled) {
      // Tailwind's px-3 py-1.5 and text-sm — never the UA defaults.
      expect(button.padding).not.toBe('0px');
      expect(button.borderRadius).not.toBe('0px');
      expect(parseFloat(button.fontSize)).toBeGreaterThan(10);
    }

    // None of our islands created a shadow root (ADR 0004). Scoped to
    // `notain-*` on purpose: Astro's own dev toolbar does use one.
    const shadowedIslands = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((element) => element.tagName.toLowerCase().startsWith('notain-'))
        .filter((element) => element.shadowRoot !== null)
        .map((element) => element.tagName.toLowerCase()),
    );
    expect(shadowedIslands).toEqual([]);
  });

  test('Svelte item grid is fully controlled by React', async ({ page }) => {
    const grid = page.locator('notain-items-grid [data-items-grid]');
    await expect(grid).toBeVisible();
    await expect(grid.locator('[data-item-row]')).toHaveCount(1);

    // The in-grid "Tambah barang" row is Svelte's own UI.
    await grid.locator('[data-add-item]').click();

    // Proof React heard the itemschange event: it pushed the longer list
    // straight back down into the island. (The grid's event does not reach
    // [data-probe-log] — that log is wired to the three probe islands only.)
    await expect(grid.locator('[data-item-row]')).toHaveCount(2);
    await expect(grid.locator('[data-item-row]').nth(1)).toBeVisible();
  });

  test('Solid inspector renders real formatted totals', async ({ page }) => {
    // 2 x Rp25.000 from the seeded grid row, formatted by core/shared/money.
    await expect(page.locator('notain-calc-inspector [data-subtotal]')).toHaveText('Rp50.000');
    await expect(page.locator('notain-calc-inspector [data-total]')).toHaveText('Rp50.000');
  });

  test('Vue picker is a working combobox that emits pick', async ({ page }) => {
    const picker = page.locator('notain-picker[data-customer-picker]');
    const input = picker.locator('[data-picker-input]');

    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    // Opening the listbox is Vue's own reactivity.
    await input.click();
    await expect(picker.locator('[data-picker-list]')).toBeVisible();
    await expect(picker.locator('[data-picker-option]')).toHaveCount(2);

    // Picking must survive the whole boundary back into React state.
    await picker.locator('[data-picker-option]').first().click();
    await expect(page.getByText('Budi Santoso', { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-probe-log] li').filter({ hasText: 'pick customer' }),
    ).toHaveCount(1);
  });

  test('Vue picker filters and reports an empty result', async ({ page }) => {
    const picker = page.locator('notain-picker[data-product-picker]');
    const input = picker.locator('[data-picker-input]');

    await input.click();
    await input.fill('kopi');
    await expect(picker.locator('[data-picker-option]')).toHaveCount(1);
    await expect(picker.locator('[data-picker-option]')).toContainText('Kopi Susu');

    await input.fill('zzzz-zzzz');
    await expect(picker.locator('[data-picker-list]')).toHaveCount(0);
    await expect(picker.locator('[data-picker-empty]')).toContainText('Tidak ada');
  });

  test('the page loads with no console errors from the islands', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.reload();
    await expect(page.locator('notain-items-grid [data-items-grid]')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
