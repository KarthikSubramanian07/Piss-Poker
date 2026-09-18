// Visual walkthrough: three players on phones play a hand; screenshots every key state.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? '/tmp/pp-shots';
const scheme = process.env.SCHEME ?? 'light';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const phone = { ...devices['iPhone 14 Pro Max'], colorScheme: scheme };
delete phone.defaultBrowserType;

async function player(name) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(name, 'pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(name, 'console', m.text()));
  return page;
}

const shot = async (page, file) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${scheme}-${file}.png` });
};

const ana = await player('Ana');
await ana.goto(BASE);
await shot(ana, '01-home');
await ana.getByRole('button', { name: 'Start a table' }).click();
await ana.waitForURL(/\/t\/[A-Z]{4}/);
const code = ana.url().match(/\/t\/([A-Z]{4})/)[1];
await ana.getByLabel('Your name').fill('Ana');
await shot(ana, '02-join');
await ana.getByRole('button', { name: 'Join table' }).click();
await ana.getByText('Seats').waitFor();

const others = [];
for (const name of ['Ben', 'Cat']) {
  const p = await player(name);
  await p.goto(`${BASE}/t/${code}`);
  await p.getByLabel('Your name').fill(name);
  await p.getByRole('button', { name: 'Join table' }).click();
  await p.getByText('Waiting for Ana').waitFor();
  others.push(p);
}
const [ben, cat] = others;
await shot(ana, '03-lobby-host');
await shot(ben, '04-lobby-guest');

await ana.getByRole('button', { name: 'Deal the first hand' }).click();
await ana.getByText('Your turn').waitFor();
await shot(ana, '05-your-turn');
await shot(ben, '06-waiting');

await ana.getByRole('button', { name: 'Raise' }).click();
await shot(ana, '07-raise');
await ana.getByRole('button', { name: 'Pot', exact: true }).click();
await ana.getByRole('button', { name: /Raise to/ }).click();
await ben.getByText('Your turn').waitFor();
await ben.getByRole('button', { name: /^Call/ }).click();
await cat.getByText('Your turn').waitFor();
await cat.getByRole('button', { name: /^Call/ }).click();
await ana.getByText('Deal the flop').first().waitFor();
await shot(ana, '08-flop-waiting');

for (let i = 0; i < 9; i++) {
  for (const p of [ana, ben, cat]) {
    if (await p.getByText('Your turn').isVisible()) {
      await p.getByRole('button', { name: 'Check' }).click();
      await p.waitForTimeout(150);
    }
  }
  if (await ana.getByText('Who won?').isVisible()) break;
}
await ana.getByText('Who won?').waitFor();
await shot(ana, '09-showdown');
await ana.locator('.win-row').filter({ hasText: 'Cat' }).click();
await ana.locator('.win-row').filter({ hasText: 'Ben' }).click();
await shot(ana, '09b-chop');
await ana.locator('.dock-award .btn-primary').click();
await ana.getByRole('button', { name: /Deal next hand/ }).waitFor();
await shot(ana, '10-hand-over');

await ana.getByRole('button', { name: 'Menu' }).click();
await shot(ana, '11-menu');
await ana.getByRole('button', { name: 'Settle up' }).click();
await shot(ana, '12-settle');
await ana.keyboard.press('Escape');

const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: scheme, deviceScaleFactor: 2 });
const display = await tablet.newPage();
await display.goto(`${BASE}/t/${code}?view=display`);
await display.getByText('Exit display').waitFor();
await shot(display, '13-display-ipad');

const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
const deskPage = await desk.newPage();
await deskPage.goto(`${BASE}/t/${code}`);
await deskPage.getByLabel('Your name').fill('Dee');
await deskPage.getByRole('button', { name: 'Join table' }).click();
await deskPage.getByRole('button', { name: /Deal next hand/ }).waitFor();
await deskPage.getByRole('button', { name: /Deal next hand/ }).click();
await deskPage.waitForTimeout(600);
await shot(deskPage, '14-desktop');
const turnPage = [ana, ben, cat, deskPage];
for (const p of turnPage) {
  if (await p.getByText('Your turn').isVisible()) {
    await shot(p, `15-turn-${p === deskPage ? 'desktop' : 'phone'}`);
  }
}
const ipadPortrait = await browser.newContext({ viewport: { width: 820, height: 1180 }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: true });
const ip = await ipadPortrait.newPage();
await ip.goto(`${BASE}/t/${code}`);
await ip.getByLabel('Your name').fill('Eve');
await ip.getByRole('button', { name: 'Join table' }).click();
await ip.waitForTimeout(600);
await shot(ip, '16-ipad-portrait');

console.log('code', code);
await browser.close();
