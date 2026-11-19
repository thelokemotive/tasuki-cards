// Renders the app icons (public/icons/*.png) from public/icons/icon.svg with the installed Chrome.
// Run after changing the SVG: node scripts/make-icons.mjs
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found (set CHROME=/path/to/chrome)');
const svg = readFileSync(resolve('public/icons/icon.svg'), 'utf8');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
try {
  const page = await browser.newPage();
  const badge = readFileSync(resolve('public/icons/badge.svg'), 'utf8');
  for (const [name, size, src] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['apple-touch-icon.png', 180, svg], ['badge-96.png', 96, badge]]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    writeFileSync(resolve('public/icons', name), await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
    console.log('wrote', name);
  }
} finally {
  await browser.close();
}
