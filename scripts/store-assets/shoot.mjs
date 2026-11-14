#!/usr/bin/env node
// Makes the Chrome Web Store screenshots and promo tiles in store/.
//
//   npm run store-assets
//
// It runs the real side panel as a web page (with fake extension APIs and the
// sample household in sample-data.ts), and injects the real badge and map code
// into a live Redfin search page in headless Chrome. Then it frames each pair
// into a 1280x800 image with a caption.
//
// Needs network access, a prior `npm run build`, and Chrome. Set CHROME_PATH if
// Chrome isn't in the usual place. Listing photos and agent names are blurred:
// they belong to the people who listed the homes, not to us.

import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const here = path.join(root, 'scripts/store-assets');
const work = path.join(here, '.build');
const out = path.join(root, 'store');

const SEARCH_URL = 'https://www.redfin.com/zipcode/20910';
// Between downtown DC and Silver Spring, so the shading has room to show.
const MAP_VIEW = { center: { lat: 38.955, lng: -77.02 }, zoom: 12 };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';

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

async function bundle() {
  await rm(work, { recursive: true, force: true });
  await mkdir(path.join(work, 'panel'), { recursive: true });
  const alias = { 'wxt/browser': path.join(here, 'fake-browser.ts') };
  const common = { bundle: true, alias, logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' } };
  await build({ ...common, entryPoints: [path.join(here, 'panel-entry.tsx')], format: 'esm', jsx: 'automatic', loader: { '.css': 'css' }, minify: true, outfile: path.join(work, 'panel/panel.js') });
  await build({ ...common, entryPoints: [path.join(here, 'page-harness.ts')], format: 'iife', minify: true, outfile: path.join(work, 'harness.js') });
  await build({ ...common, entryPoints: [path.join(here, 'node-routing.ts')], platform: 'node', format: 'esm', outfile: path.join(work, 'node-routing.mjs') });
  await writeFile(
    path.join(work, 'panel/index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="panel.css"></head>' +
      '<body><div id="root"></div><script type="module" src="panel.js"></script></body></html>',
  );
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const server = createServer(async (req, res) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    try {
      const body = await readFile(file.endsWith(path.sep) ? path.join(file, 'index.html') : file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

// ---------------------------------------------------------------- the Redfin page

async function openSearchPage(browser, width, data, mapScript, harness) {
  const page = await browser.newPage({ viewport: { width, height: 740 }, userAgent: UA, locale: 'en-US', timezoneId: 'America/New_York' });
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
  // Redfin's CDN starts refusing headless Chrome after a handful of runs in a row.
  if (/could not be satisfied|request blocked/i.test(await page.title())) {
    throw new Error('Redfin is refusing requests from this machine for now (CloudFront block). Try again in an hour or so.');
  }
  await page.waitForSelector('.bp-Homecard', { timeout: 45_000 });
  await page.waitForFunction(() => !!window.__preloaded_map__, null, { timeout: 30_000 });
  await page.evaluate((view) => {
    window.__preloaded_map__.setCenter(view.center);
    window.__preloaded_map__.setZoom(view.zoom);
  }, MAP_VIEW);
  await page.waitForTimeout(4000); // Redfin re-searches for the new map area
  await page.evaluate(mapScript);
  await page.evaluate(harness);
  await tidy(page);
  const cards = await page.evaluate((d) => window.__railtymapsShots.badges(d), data);
  await page.evaluate((d) => window.__railtymapsShots.map(d), data);
  await page.waitForTimeout(1500);
  console.log(`  ${cards} listing cards with badges at ${width}px`);
  return page;
}

// Blur listing photos and agent names, hide anything that pops over the page.
// Inline styles via the DOM, because a <style> tag can be refused by the site's CSP.
async function tidy(page) {
  await page.evaluate(() => {
    for (const img of document.querySelectorAll('.bp-Homecard img, .HomeCardContainer img')) img.style.filter = 'blur(10px) saturate(0.6)';
    for (const el of document.querySelectorAll('.bp-Homecard__Attribution, .bp-Homecard__Attribution--content')) el.style.visibility = 'hidden';
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' && !el.closest('.gm-style') && el.offsetHeight > 40 && el.id !== 'header-content') {
        if (/dialog|modal|banner|prompt|toast|cookie/i.test(`${el.className} ${el.getAttribute('role') ?? ''} ${el.id}`)) el.style.display = 'none';
      }
    }
  });
}

// ---------------------------------------------------------------- the side panel

async function openPanel(browser, url) {
  const page = await browser.newPage({ viewport: { width: 400, height: 740 }, colorScheme: 'light', locale: 'en-US', timezoneId: 'America/New_York' });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('.option').length >= 3 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 90_000 });
  return page;
}

async function panelTab(page, name) {
  await page.getByRole('button', { name, exact: false }).first().click();
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------- framing

const MARK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v5.5h11V10"/><path d="M3 19.5h18"/></svg>`;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const dataUrl = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

function pairHtml(left, right) {
  return `<!doctype html><html><body style="margin:0;width:1280px;height:740px;overflow:hidden;display:flex;background:#fff">
    <img src="${dataUrl(left)}" style="width:880px;height:740px"><img src="${dataUrl(right)}" style="width:400px;height:740px;border-left:1px solid #cbd5e1;box-sizing:border-box"></body></html>`;
}

function frameHtml(caption, left, right) {
  const shots = right
    ? `<img src="${dataUrl(left)}" style="width:880px;height:740px"><img src="${dataUrl(right)}" style="width:400px;height:740px;border-left:1px solid #cbd5e1;box-sizing:border-box">`
    : `<img src="${dataUrl(left)}" style="width:1280px;height:740px">`;
  return `<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;background:#0f172a;font-family:${FONT}">
    <div style="height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;color:#fff">
      <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em">${caption}</div>
      <div style="display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700">
        <span style="width:30px;height:30px;border-radius:8px;background:#1d4ed8;display:inline-flex;align-items:center;justify-content:center">${MARK}</span>RailtyMaps</div>
    </div>
    <div style="display:flex;height:740px;background:#fff">${shots}</div></body></html>`;
}

const PILLS = `
  <span style="display:inline-flex;align-items:center;gap:6px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:999px;padding:4px 12px 4px 4px;font-weight:700">
    <span style="width:24px;height:24px;border-radius:50%;background:#1d4ed8;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px">Me</span>~34 Work</span>
  <span style="display:inline-flex;align-items:center;gap:6px;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:999px;padding:4px 12px 4px 4px;font-weight:700">
    <span style="width:24px;height:24px;border-radius:50%;background:#a21caf;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px">Mo</span>~26 Clinic</span>
  <span style="display:inline-flex;align-items:center;gap:6px;background:#ffedd5;color:#9a3412;border:1px solid #fdba74;border-radius:999px;padding:4px 12px 4px 4px;font-weight:700">
    <span style="width:24px;height:24px;border-radius:50%;background:#0f766e;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px">D</span>~49 Church</span>`;

function smallTileHtml() {
  return `<!doctype html><html><body style="margin:0;width:440px;height:280px;overflow:hidden;background:#1d4ed8;color:#fff;font-family:${FONT}">
    <div style="height:280px;box-sizing:border-box;padding:0 30px;display:flex;flex-direction:column;justify-content:center;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;font-size:30px;font-weight:800;letter-spacing:-0.02em">
        <span style="width:44px;height:44px;border-radius:11px;background:#fff;display:inline-flex;align-items:center;justify-content:center">${MARK.replace('stroke="#fff"', 'stroke="#1d4ed8"').replace(/20/g, '28')}</span>RailtyMaps</div>
      <div style="font-size:18px;line-height:1.35;font-weight:600;max-width:360px">Transit times on every home listing, for everyone in your household.</div>
      <div style="display:flex;gap:6px;font-size:13px;margin-top:8px">${PILLS}</div>
    </div></body></html>`;
}

function marqueeHtml(shot) {
  return `<!doctype html><html><body style="margin:0;width:1400px;height:560px;overflow:hidden;background:#0f172a;color:#fff;font-family:${FONT}">
    <div style="display:flex;height:560px">
      <div style="width:560px;padding:64px 0 0 64px;box-sizing:border-box;display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;gap:12px;font-size:22px;font-weight:800">
          <span style="width:38px;height:38px;border-radius:10px;background:#1d4ed8;display:inline-flex;align-items:center;justify-content:center">${MARK}</span>RailtyMaps</div>
        <div style="font-size:48px;line-height:1.08;font-weight:800;letter-spacing:-0.03em">Transit times on every listing</div>
        <div style="font-size:19px;line-height:1.45;color:#cbd5e1;max-width:440px">Door-to-door bus and Metro times from Zillow and Redfin homes to every place your household goes.</div>
        <div style="display:flex;gap:6px;font-size:14px;margin-top:6px">${PILLS}</div>
      </div>
      <div style="flex:1;position:relative">
        <img src="${dataUrl(shot)}" style="position:absolute;left:30px;top:56px;width:860px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      </div>
    </div></body></html>`;
}

async function snap(browser, html, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const png = await page.screenshot();
  await page.close();
  return png;
}

async function render(browser, html, width, height, name) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  // PNG for the README, JPEG for the store (it rejects images with an alpha channel).
  const png = await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 92 });
  await page.close();
  console.log(`  wrote store/${name}.png and .jpg`);
  return png;
}

// ---------------------------------------------------------------- main

async function main() {
  const mapScriptPath = path.join(root, '.output/chrome-mv3/content-scripts/map.js');
  if (!existsSync(mapScriptPath)) throw new Error('Run `npm run build` first; this injects the built map script.');
  await mkdir(path.join(out, 'screenshots'), { recursive: true });
  await mkdir(path.join(out, 'promo'), { recursive: true });

  console.log('Bundling…');
  await bundle();
  const routing = await import(pathToFileURL(path.join(work, 'node-routing.mjs')).href);
  const { people, places, saved } = routing;
  const personOf = (place) => people.find((p) => p.id === place.personId);

  console.log('Asking Transitous for the sample places…');
  const reach = {};
  for (const place of places) reach[place.id] = await routing.reachFor(place, personOf(place));
  const route = await routing.bestRoute(saved[0], places[0], personOf(places[0]));
  const routeLegs = (route?.legs ?? []).filter((l) => l.polyline).map((l) => ({ mode: l.mode, polyline: l.polyline, precision: l.precision ?? 7, color: l.color }));
  const data = { people, places, reach, bands: [30, 45, 60], shade: 'work' };

  const [mapScript, harness] = await Promise.all([readFile(mapScriptPath, 'utf8'), readFile(path.join(work, 'harness.js'), 'utf8')]);
  const server = await serve(path.join(work, 'panel'));
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });

  try {
    console.log('Capturing the side panel…');
    const panel = await openPanel(browser, server.url);
    const panelHome = await panel.screenshot();
    await panel.getByRole('button', { name: 'Steps' }).first().click();
    await panel.waitForTimeout(400);
    await panel.evaluate(() => document.querySelectorAll('.section')[1]?.scrollIntoView({ block: 'start' }));
    await panel.waitForTimeout(300);
    const panelSteps = await panel.screenshot();
    await panel.evaluate(() => window.scrollTo(0, 0));
    await panelTab(panel, 'Saved');
    await panel.waitForFunction(() => document.querySelectorAll('.compare tbody tr').length >= 3 && !document.body.innerText.includes('…'), null, { timeout: 60_000 });
    const panelSaved = await panel.screenshot();
    await panelTab(panel, 'People');
    const panelPeople = await panel.screenshot();

    console.log('Capturing Redfin…');
    const narrow = await openSearchPage(browser, 880, data, mapScript, harness);
    const pageListings = await narrow.screenshot();
    await narrow.evaluate(([d, legs]) => window.__railtymapsShots.map(d, legs), [data, routeLegs]);
    await narrow.waitForTimeout(1200);
    const pageRoute = await narrow.screenshot();
    await narrow.evaluate((d) => window.__railtymapsShots.map({ ...d, shade: 'clinic' }), data);
    await narrow.waitForTimeout(1200);
    const pageClinic = await narrow.screenshot();

    const wide = await openSearchPage(browser, 1280, data, mapScript, harness);
    const pageWide = await wide.screenshot();

    console.log('Framing…');
    await render(browser, frameHtml('Transit times on every listing', pageListings, panelHome), 1280, 800, 'screenshots/01-listings');
    await render(browser, frameHtml("Everyone's trips, on every listing", pageWide), 1280, 800, 'screenshots/02-cards');
    await render(browser, frameHtml('Every route, step by step', pageRoute, panelSteps), 1280, 800, 'screenshots/03-routes');
    await render(browser, frameHtml('Compare saved homes for the whole household', pageClinic, panelSaved), 1280, 800, 'screenshots/04-saved');
    await render(browser, frameHtml('Walking limits for each person', pageListings, panelPeople), 1280, 800, 'screenshots/05-people');
    await render(browser, smallTileHtml(), 440, 280, 'promo/small-440x280');
    const pair = await snap(browser, pairHtml(pageListings, panelHome), 1280, 740);
    await render(browser, marqueeHtml(pair), 1400, 560, 'promo/marquee-1400x560');
  } finally {
    await browser.close();
    server.close();
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
