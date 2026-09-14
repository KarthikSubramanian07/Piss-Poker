// Renders PNG icons and the OpenGraph card from HTML with the real fonts. Run: node scripts/assets.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'public');
const font = (p) => `data:font/woff2;base64,${fs.readFileSync(path.join(root, 'node_modules', p)).toString('base64')}`;
const faces = `
@font-face { font-family: Geist; src: url(${font('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')}); font-weight: 100 900; }
@font-face { font-family: Serif; src: url(${font('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2')}); font-style: italic; }
`;
const mark = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');

const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage();

async function render(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><style>${faces} html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, file), omitBackground: false });
  console.log('wrote', file);
}

const icon = (size, pad) =>
  `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#f5db2b">
     <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${mark.replace('<rect width="64" height="64" rx="14" fill="#f5db2b"/>', '').replace('<svg ', '<svg width="100%" height="100%" ')}</div>
   </div>`;

await render(icon(32, 0), 32, 32, 'favicon-32.png');
await render(icon(180, 14), 180, 180, 'apple-touch-icon.png');
await render(icon(192, 16), 192, 192, 'icon-192.png');
await render(icon(512, 40), 512, 512, 'icon-512.png');
await render(icon(512, 110), 512, 512, 'icon-maskable-512.png');

const seat = (name, tag, stack, acting) => `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;margin:0 -16px;border-radius:14px;${acting ? 'background:#3a3300;' : ''}">
    <div><div style="font-size:22px;font-weight:600">${name}</div><div style="margin-top:4px;font-size:13px;color:#a9a8a3">${tag}</div></div>
    <div style="font-size:24px;font-weight:560;font-variant-numeric:tabular-nums">${stack}</div>
  </div>`;

await render(
  `<div style="position:relative;width:1200px;height:630px;background:#0a0a0a;color:#f2f1ed;font-family:Geist;overflow:hidden">
    <div style="position:absolute;left:84px;top:150px">
      <div style="font-family:Serif;font-style:italic;font-size:150px;line-height:.95;letter-spacing:-2px">
        <span style="background:#f5db2b;color:#191606;padding:0 14px;margin-left:-14px;border-radius:14px">Piss</span> Poker
      </div>
      <div style="margin-top:36px;font-size:40px;color:#bdbcb7;letter-spacing:-.5px">Chips on your phone.<br/>Cards on the table.</div>
      <div style="margin-top:44px;font-size:24px;color:#8d8c87">piss-poker.pages.dev</div>
    </div>
    <div style="position:absolute;right:90px;top:70px;width:340px;height:640px;border-radius:52px;background:#141414;box-shadow:0 0 0 10px #232323, 0 40px 80px rgba(0,0,0,.6);overflow:hidden">
      <div style="padding:40px 30px 0">
        <div style="font-size:15px;color:#a9a8a3">Pot</div>
        <div style="font-size:84px;font-weight:560;letter-spacing:-4px;line-height:1">1,240</div>
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;font-size:17px;color:#bdbcb7">
          <span style="background:#f5db2b;color:#191606;font-weight:650;padding:5px 12px;border-radius:99px">Deal the turn</span> You to act
        </div>
        <div style="margin-top:22px">${seat('Karthik', 'D · to act', '3,420', true)}${seat('Sam', 'SB', '1,875', false)}</div>
      </div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:200px;background:#f5db2b;color:#191606;padding:22px 26px">
        <div style="font-size:28px;font-weight:700;letter-spacing:-.5px">Your turn</div>
        <div style="font-size:16px;opacity:.8">620 to call</div>
        <div style="display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:8px;margin-top:16px">
          <div style="border:2px solid rgba(25,22,6,.5);border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">Fold</div>
          <div style="background:#191606;color:#f5db2b;border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">Call 620</div>
          <div style="border:2px solid rgba(25,22,6,.5);border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">Raise</div>
        </div>
      </div>
    </div>
  </div>`,
  1200,
  630,
  'og.png',
);

await browser.close();
