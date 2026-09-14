import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
});

async function seat(browser: Browser, name: string, code?: string, options: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ ...test.info().project.use, ...options });
  contexts.push(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { errors: string[] }).errors = errors;
  if (code) {
    await page.goto(`/t/${code}`);
  } else {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start a table' }).click();
    await page.waitForURL(/\/t\/[A-Z]{4}$/);
  }
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join table' }).click();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();
  return page;
}

const codeOf = (page: Page) => page.url().match(/\/t\/([A-Z]{4})/)![1];
const yourTurn = (page: Page) => page.getByText('Your turn', { exact: true });
const stackOf = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.locator('.seat-name', { hasText: new RegExp(`^${name}`) }) }).locator('.seat-stack');

async function actWhoeverIsUp(pages: Page[], action: 'Check' | RegExp) {
  for (let i = 0; i < 100; i++) {
    for (const p of pages) {
      if (!(await yourTurn(p).isVisible())) continue;
      try {
        await p.getByRole('button', { name: action }).click({ timeout: 2_000 });
      } catch {
        continue; // the turn moved on between the check and the click
      }
      await expect(yourTurn(p)).toBeHidden({ timeout: 3_000 }).catch(() => undefined);
      return p;
    }
    await pages[0].waitForTimeout(100);
  }
  throw new Error('nobody had a turn');
}

test('three players play a hand from deal to payout', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await expect(ben.getByText('Waiting for Ana to deal the first hand')).toBeVisible();
  await ana.getByRole('button', { name: 'Deal the first hand' }).click();

  await expect(yourTurn(ana)).toBeVisible();
  await expect(ben.getByText('Ana to act · 10 to call')).toBeVisible();
  await ana.getByRole('button', { name: 'Raise' }).click();
  await ana.getByLabel('Amount').fill('60');
  await ana.getByRole('textbox').fill('60');
  await ana.getByRole('button', { name: 'Raise to 60' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: 'Call 55' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: 'Fold' }).click();

  await expect(ana.getByText('Deal the flop')).toBeVisible();
  await expect(ana.locator('.pot-amount')).toHaveText('130');

  for (let i = 0; i < 6; i++) await actWhoeverIsUp([ana, ben], 'Check');
  await expect(cat.getByText('Who won?')).toBeVisible();
  await cat.getByRole('button', { name: 'Ben' }).click();
  await cat.getByRole('button', { name: 'Pay out' }).click();

  await expect(ana.locator('.stage-line')).toHaveText('Ben takes it');
  await expect(stackOf(ana, 'Ben')).toHaveText('1,070');
  await expect(stackOf(ben, 'Ana')).toHaveText('940');
  await expect(stackOf(cat, 'Cat')).toHaveText('990');

  await ana.getByRole('button', { name: 'Menu' }).click();
  await ana.getByRole('button', { name: 'Settle up' }).click();
  await expect(ana.getByText('Ana pays Ben')).toBeVisible();
  await ana.keyboard.press('Escape');

  await ben.getByRole('button', { name: /Deal next hand/ }).click();
  await expect(ana.getByText('Hand 2', { exact: true })).toBeVisible();
  for (const p of [ana, ben, cat]) expect((p as Page & { errors: string[] }).errors).toEqual([]);
});

test('short stack all in creates a side pot that pays the right people', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await ana.getByRole('button', { name: 'Manage' }).click();
  const benRow = ana.locator('.player-row').filter({ hasText: 'Ben' });
  await benRow.getByRole('button', { name: 'Set stack' }).click();
  await ana.getByLabel('New stack for Ben').fill('100');
  await ana.getByRole('button', { name: 'Set', exact: true }).click();
  await expect(benRow).toContainText('100');
  await ana.keyboard.press('Escape');

  await ana.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: 'Raise' }).click();
  await ana.getByRole('button', { name: 'All in', exact: true }).click();
  await ana.getByRole('button', { name: 'All in 1,000' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: 'All in 95' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: 'All in 990' }).click();

  await expect(ana.getByText('Who won?')).toBeVisible();
  await expect(ana.getByText('Deal out the rest of the board first.', { exact: false })).toBeVisible();
  const main = ana.locator('.pot-pick').filter({ hasText: 'Main pot' });
  const side = ana.locator('.pot-pick').filter({ hasText: 'Side pot 1' });
  await expect(main).toContainText('300');
  await expect(side).toContainText('1,800');
  await expect(side.getByRole('button', { name: 'Ben' })).toHaveCount(0);

  await main.getByRole('button', { name: 'Ben' }).click();
  await side.getByRole('button', { name: 'Cat' }).click();
  await ana.getByRole('button', { name: 'Pay out' }).click();

  await expect(stackOf(ana, 'Ben')).toHaveText('300');
  await expect(stackOf(ana, 'Cat')).toHaveText('1,800');
  await expect(stackOf(ana, 'Ana')).toHaveText('0');
  await expect(ana.getByRole('button', { name: 'Rebuy for 1,000' })).toBeVisible();
  await ana.getByRole('button', { name: 'Rebuy for 1,000' }).click();
  await expect(stackOf(ben, 'Ana')).toHaveText('1,000');
});

test('anyone can act for a seat without a phone, and undo rolls it back', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);

  await ana.getByRole('button', { name: 'Manage' }).click();
  await ana.getByLabel('Add someone without a phone').fill('Gran');
  await ana.getByRole('button', { name: 'Add' }).click();
  await expect(ana.locator('.player-row').filter({ hasText: 'Gran' })).toBeVisible();
  await ana.keyboard.press('Escape');

  await ana.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: 'Call 10' }).click();
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: 'Call 5' }).click();

  await expect(ana.getByRole('button', { name: 'Act for Gran' })).toBeVisible();
  await ben.getByRole('button', { name: 'Act for Gran' }).click();
  await expect(ben.getByText('Acting for Gran')).toBeVisible();
  await ben.getByRole('button', { name: 'Check' }).click();
  await expect(ana.getByText('Deal the flop')).toBeVisible();

  await ana.getByRole('button', { name: 'Menu' }).click();
  await expect(ana.getByText('Gran checks (by Ben)')).toBeVisible();
  await ana.getByRole('button', { name: /^Undo/ }).click();
  await expect(ben.getByRole('button', { name: 'Act for Gran' })).toBeVisible();
  await expect(ben.locator('.phase-name')).toHaveText('Preflop');
});

test('a new device can take over a seat after approval', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);

  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  const benTablet = await ctx.newPage();
  await benTablet.goto(`/t/${code}`);
  await benTablet.getByRole('button', { name: /^Ben/ }).click();
  await expect(benTablet.getByText('Asking the table')).toBeVisible();

  await expect(ana.getByText('A new device wants to take')).toBeVisible();
  await ana.getByRole('button', { name: 'Allow' }).click();

  await expect(benTablet.getByRole('button', { name: 'Menu' })).toBeVisible();
  await expect(benTablet.locator('.seat-you')).toHaveCount(0);
  await expect(ben.getByText('Seat moved')).toBeVisible();
});

test('recovers after losing the connection', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  await ana.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourTurn(ana)).toBeVisible();

  await ben.context().setOffline(true);
  await ben.evaluate(() => window.dispatchEvent(new Event('offline')));
  await ana.getByRole('button', { name: 'Call 5' }).click();
  await ben.context().setOffline(false);
  await ben.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(yourTurn(ben)).toBeVisible({ timeout: 20_000 });
  await ben.getByRole('button', { name: 'Check' }).click();
  await expect(ana.getByText('Deal the flop')).toBeVisible();
});

test('desktop keyboard shortcuts drive the action bar', async ({ browser }) => {
  const ana = await seat(browser, 'Ana', undefined, { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.keyboard.press('r');
  await expect(ana.getByRole('button', { name: 'Raise to 20' })).toBeVisible();
  await ana.keyboard.press('ArrowUp');
  await expect(ana.getByRole('button', { name: 'Raise to 30' })).toBeVisible();
  await ana.keyboard.press('Enter');
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: 'Fold' }).click();
  await expect(ana.getByRole('button', { name: /Deal next hand/ })).toBeVisible();
  await ana.keyboard.press('n');
  await expect(ana.getByText('Hand 2', { exact: true })).toBeVisible();
});

test('no horizontal overflow from small phones to desktops', async ({ browser }) => {
  const host = await seat(browser, 'Ana with a long name');
  const code = codeOf(host);
  await seat(browser, 'Bartholomew', code);
  for (const width of [320, 390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    for (const path of ['/', `/t/${code}`, `/t/${code}?view=display`]) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  }
});

test('unknown table codes and room pages explain themselves', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Have a code?').fill('zzzz');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('alert')).toContainText('No table called ZZZZ');
  await page.goto('/t/QQQQ');
  await expect(page.getByText('No table called QQQQ')).toBeVisible();
});
