// Automated print acceptance check (spec 11: "Nine cards print on one A4 sheet with no clipped
// names, stats or borders"). Uses the locally installed Chrome via puppeteer-core (no download).
// Usage: node scripts/check-print.mjs [path-to-html]   (default dist-single/tasuki-cards.html)
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = resolve(process.argv[2] ?? 'dist-single/tasuki-cards.html');
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/opt/pw-browsers/chromium',
].find((p) => p && existsSync(p));
if (!existsSync(html)) throw new Error(`Build first: ${html} not found`);
if (!CHROME) throw new Error('Chrome not found');

const outDir = resolve('test-output');
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'tasuki-print-'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--allow-file-access-from-files', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = pathToFileURL(html).href;

  // 1. Load demo data through the real UI.
  await page.goto(`${url}#/settings?tab=data`, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="load-demo"]', { timeout: 15000 });
  await page.click('[data-testid="load-demo"]');
  const confirm = await page.$('[data-testid="confirm-load-demo"]');
  if (confirm) await confirm.click();
  await page.waitForFunction(() => document.body.innerText.includes('Demo data is loaded'), { timeout: 15000 });

  // 1b. Persistence from file:// — reload and the data must still be there, saved in IndexedDB.
  await new Promise((r) => setTimeout(r, 800));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.includes('Settings'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 800));
  const persisted = await page.evaluate(() => ({
    demo: document.body.innerText.includes('Demo data is loaded'),
    memoryOnly: document.body.innerText.includes('Browser storage is unavailable'),
  }));
  check('data survives a reload when opened from file:// (IndexedDB)', persisted.demo && !persisted.memoryOnly, JSON.stringify(persisted));

  // 2. Print studio with every card selected.
  await page.goto(`${url}#/cards?select=all`, { waitUntil: 'load' });
  await page.waitForSelector('.print-sheet .tcard', { timeout: 15000 });
  await page.emulateMediaType('print');
  await new Promise((r) => setTimeout(r, 500));

  const report = await page.evaluate(() => {
    const MM = 96 / 25.4;
    const sheets = [...document.querySelectorAll('.print-sheet')];
    const issues = [];
    const inside = (a, b, tol = 0.6) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
    let cards = 0;
    sheets.forEach((sheet, si) => {
      const sr = sheet.getBoundingClientRect();
      if (Math.abs(sr.width - 210 * MM) > 2 || Math.abs(sr.height - 297 * MM) > 2) issues.push(`sheet ${si + 1} is ${(sr.width / MM).toFixed(1)}×${(sr.height / MM).toFixed(1)} mm, expected 210×297`);
      sheet.querySelectorAll('.tcard').forEach((card) => {
        cards++;
        const cr = card.getBoundingClientRect();
        const who = card.getAttribute('data-athlete');
        if (Math.abs(cr.width - 63 * MM) > 1 || Math.abs(cr.height - 88 * MM) > 1) issues.push(`card ${who} is ${(cr.width / MM).toFixed(1)}×${(cr.height / MM).toFixed(1)} mm`);
        if (!inside(cr, sr)) issues.push(`card ${who} border falls outside its A4 sheet`);
        // Every text element must sit inside the card and not overflow its own box.
        card.querySelectorAll('[data-fit], .tc-stat, .tc-race, .tc-head, .tc-row, .tc-footer').forEach((el) => {
          const er = el.getBoundingClientRect();
          const label = `${el.className || el.tagName} "${(el.textContent || '').trim().slice(0, 30)}"`;
          if (!inside(er, cr)) issues.push(`card ${who}: ${label} extends outside the card`);
          if (el.scrollWidth > el.clientWidth + 1) issues.push(`card ${who}: ${label} is clipped horizontally (${el.scrollWidth} > ${el.clientWidth})`);
          if (el.scrollHeight > el.clientHeight + 1) issues.push(`card ${who}: ${label} is clipped vertically (${el.scrollHeight} > ${el.clientHeight})`);
        });
        // Locked stats must not show numbers.
        card.querySelectorAll('.tc-stat.is-locked').forEach((el) => {
          if (/\d/.test(el.querySelector('.tc-stat-locked')?.textContent ?? '')) issues.push(`card ${who}: locked stat shows a number`);
        });
        // Provisional markers never print.
        card.querySelectorAll('.prov').forEach((el) => {
          if (getComputedStyle(el).display !== 'none') issues.push(`card ${who}: provisional marker visible in print`);
        });
      });
    });
    const firstSheetCards = sheets[0]?.querySelectorAll('.tcard').length ?? 0;
    return { sheets: sheets.length, cards, firstSheetCards, issues, dobVisible: /\b(19|20)\d\d-\d\d-\d\d\b/.test(document.querySelector('.print-sheets')?.textContent ?? '') };
  });

  check('demo data produced cards', report.cards >= 9, `${report.cards} cards on ${report.sheets} sheets`);
  check('nine cards on the first A4 sheet', report.firstSheetCards === 9, `${report.firstSheetCards} on sheet 1`);
  check('sheets = ceil(cards / 9)', report.sheets === Math.ceil(report.cards / 9));
  check('no clipped names, stats or borders', report.issues.length === 0, report.issues.slice(0, 15).join('\n'));
  check('no ISO dates (e.g. a DOB) printed on cards', !report.dobVisible);

  const firstSheet = await page.$('.print-sheet');
  if (firstSheet) await firstSheet.screenshot({ path: join(outDir, 'sheet1-print.png') });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, scale: 1 });
  writeFileSync(join(outDir, 'cards-print.pdf'), pdf);
  const pdfText = Buffer.from(pdf).toString('latin1');
  const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF has one page per sheet (Chrome print, 100% scale)', pages === report.sheets, `${pages} PDF pages for ${report.sheets} sheets`);
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdfText);
  if (box) check('PDF page size is A4 portrait', Math.abs(+box[1] - 595.28) < 2 && Math.abs(+box[2] - 841.89) < 2, `${box[1]} × ${box[2]} pt`);
  await page.emulateMediaType('screen');
  await page.screenshot({ path: join(outDir, 'print-studio.png'), fullPage: false });
  check('no page errors', errors.length === 0, errors.join('\n'));
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail.replace(/\n/g, '\n      ')}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} print checks passed. PDF: test-output/cards-print.pdf`);
process.exit(failed ? 1 : 0);
