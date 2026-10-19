import { test, type Page } from '@playwright/test';
import { signIn } from './support';

const PROD = 'https://notain.pages.dev';

async function closeTour(page: Page): Promise<void> {
  const popover = page.locator('.driver-popover');
  try {
    await popover.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    return;
  }
  await page.keyboard.press('Escape');
  await popover.waitFor({ state: 'hidden', timeout: 5_000 });
}

test('prod smoke: layout, catalog picker, deferred editor', async ({ page }) => {
  test.setTimeout(120_000);
  const bad: string[] = [];
  page.on('pageerror', (e) => bad.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('notain.pages.dev'))
      bad.push(`http ${r.status()} ${r.url()}`);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, PROD);

  await page.goto(`${PROD}/invoices`);
  await page.waitForTimeout(2500);
  await closeTour(page);
  const links = await page.locator('a[href*="/invoice/"]').evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute('href')),
  );
  const target = links.find((h) => h && !/\/invoice\/(new|print)/.test(h));
  if (!target) throw new Error('no invoice link');
  await page.goto(`${PROD}${target}`);
  await page.waitForSelector('#invoice-form', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await closeTour(page);

  const f = await page.locator('#invoice-form').boundingBox();
  const a = await page.locator('aside[data-tour="inv-preview"]').boundingBox();
  console.log('PREVIEW_BESIDE=', !!(f && a && a.x > f.x + f.width - 5));

  console.log('EDITORS_ON_DETAIL=', await page.locator('.notain-rich-text').count());
  await page.getByRole('tab', { name: 'Bagian atas' }).click();
  await page.waitForSelector('.notain-rich-text', { timeout: 20000 });
  console.log(
    'EDITOR_AFTER_TAB=',
    await page.locator('.notain-rich-text').count(),
    'ERROR_PANEL=',
    await page.getByText('Editor teks gagal dimuat').count(),
  );

  await page.getByRole('tab', { name: 'Barang' }).click();
  await page.getByRole('button', { name: 'Ambil dari katalog' }).click();
  await page.waitForTimeout(2500);
  const dialog = page.locator('[role="dialog"]').first();
  console.log('CATALOG_DIALOG:', (await dialog.innerText()).replace(/\n/g, ' | ').slice(0, 300));
  await page.screenshot({ path: '/tmp/prod-final.png' });

  console.log('BAD:', JSON.stringify(bad, null, 1));
});
