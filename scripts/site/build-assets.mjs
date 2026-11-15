#!/usr/bin/env node
// Makes the images for the website in site/:
//
//   npm run site-assets
//
// Crops the store screenshots (store/screenshots, from `npm run store-assets`)
// down to the part worth showing and encodes them as WebP, then renders the
// 1200x630 share image, the touch icon and favicon.ico. Uses the system Chrome
// through playwright-core, like the store assets do. Set CHROME_PATH if Chrome
// isn't in the usual place.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = path.join(root, 'site');
const img = path.join(site, 'assets/img');

// Every store screenshot has a 60px caption bar on top. `widths` are the sizes
// to encode; the first is the full one.
const CROPS = [
  { name: 'listings', from: '01-listings.png', x: 0, y: 60, w: 1280, h: 740, widths: [1280, 800] },
  { name: 'cards', from: '02-cards.png', x: 0, y: 60, w: 900, h: 740, widths: [900] },
  { name: 'routes', from: '03-routes.png', x: 420, y: 60, w: 860, h: 740, widths: [860] },
  { name: 'saved', from: '04-saved.png', x: 420, y: 60, w: 860, h: 740, widths: [860] },
];

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** The toolbar icon (scripts/make-icons.py) as SVG. `radius` 0 for a full-bleed touch icon. */
export function logoSvg(radius = 22) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="${radius}" fill="#1d4ed8"/><path d="M50 14 15 45h70z" fill="#fff"/><path d="M25 42h50v24H25z" fill="#fff"/><path d="M44 53h12v13H44z" fill="#1d4ed8"/><rect x="10" y="75.5" width="80" height="9" rx="4.5" fill="#fbbf24"/><circle cx="28" cy="80" r="7.5" fill="#fff"/><circle cx="72" cy="80" r="7.5" fill="#fff"/></svg>`;
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
    win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  }[process.platform] ?? [];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH.');
  return found;
}

/** Crops and scales a PNG in the browser and returns it encoded as `type`. */
async function encode(page, png, crop, width, type, quality) {
  const b64 = await page.evaluate(
    async ({ src, crop, width, type, quality }) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round((crop.h * width) / crop.w);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(type, quality).split(',')[1];
    },
    { src: `data:image/png;base64,${png.toString('base64')}`, crop, width, type, quality },
  );
  return Buffer.from(b64, 'base64');
}

const PILL = (bg, fg, bd, avatarBg, initials, text) =>
  `<span style="display:inline-flex;align-items:center;gap:7px;background:${bg};color:${fg};border:1px solid ${bd};border-radius:999px;padding:4px 14px 4px 4px;font-weight:700">` +
  `<span style="width:28px;height:28px;border-radius:50%;background:${avatarBg};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px">${initials}</span>${text}</span>`;

function shareHtml(shot) {
  return `<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#0f172a;color:#fff;font-family:${FONT}">
    <div style="display:flex;height:630px">
      <div style="width:560px;flex:none;padding:70px 0 0 72px;box-sizing:border-box;display:flex;flex-direction:column;gap:22px">
        <div style="display:flex;align-items:center;gap:14px;font-size:28px;font-weight:800;letter-spacing:-0.01em">
          <span style="width:48px;height:48px;display:inline-flex">${logoSvg()}</span>RailtyMaps</div>
        <div style="font-size:58px;line-height:1.04;font-weight:800;letter-spacing:-0.035em">Transit times on every listing</div>
        <div style="font-size:23px;line-height:1.4;color:#cbd5e1;max-width:440px">Bus, train, driving and walking times on Zillow and Redfin, for everyone in your household.</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:17px;margin-top:6px">
          ${PILL('#fef3c7', '#92400e', '#fcd34d', '#1d4ed8', 'Me', '~34 Work')}
          ${PILL('#d1fae5', '#065f46', '#6ee7b7', '#a21caf', 'Mo', '~26 Clinic')}
          ${PILL('#ffedd5', '#9a3412', '#fdba74', '#0f766e', 'D', '~49 Church')}
        </div>
      </div>
      <div style="flex:1;position:relative">
        <img src="data:image/webp;base64,${shot.toString('base64')}" style="position:absolute;left:28px;top:70px;width:900px;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55)">
      </div>
    </div></body></html>`;
}

/** An .ico holding the given PNGs as-is (supported everywhere since Windows Vista). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0);
    e.writeUInt8(size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

async function main() {
  await mkdir(img, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  try {
    const page = await browser.newPage();
    let hero;
    for (const c of CROPS) {
      const png = await readFile(path.join(root, 'store/screenshots', c.from));
      for (const width of c.widths) {
        const webp = await encode(page, png, c, width, 'image/webp', 0.82);
        const file = `${c.name}-${width}.webp`;
        await writeFile(path.join(img, file), webp);
        console.log(`  site/assets/img/${file}  ${Math.round(webp.length / 1024)} kB`);
        if (c.name === 'listings' && width === 1280) hero = webp;
      }
    }

    // Share image: JPEG, since not every app that unfurls links reads WebP.
    const share = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await share.setContent(shareHtml(hero), { waitUntil: 'load' });
    const og = await share.screenshot({ type: 'jpeg', quality: 88 });
    await writeFile(path.join(img, 'share.jpg'), og);
    console.log(`  site/assets/img/share.jpg  ${Math.round(og.length / 1024)} kB`);

    // iOS rounds the corners itself, so the touch icon is square.
    const touch = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await touch.setContent(`<body style="margin:0">${logoSvg(0).replace('<svg ', '<svg width="180" height="180" ')}</body>`);
    await writeFile(path.join(site, 'apple-touch-icon.png'), await touch.screenshot());

    await writeFile(path.join(site, 'favicon.svg'), logoSvg() + '\n');
    const icons = await Promise.all([16, 32].map(async (size) => ({ size, buf: await readFile(path.join(root, `public/icon/${size}.png`)) })));
    await writeFile(path.join(site, 'favicon.ico'), ico(icons));
    console.log('  site/apple-touch-icon.png, site/favicon.svg, site/favicon.ico');
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
