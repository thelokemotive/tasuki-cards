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
          // A rating is 40–99; hints may name distances ("Bleep or 5K+"), so look for a rating-shaped number.
          if (/(^|[^\d.])(4\d|[5-9]\d)(?![\d.])/.test(el.querySelector('.tc-stat-locked')?.textContent ?? '')) issues.push(`card ${who}: locked stat shows a number`);
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
  // 3. White Season Gym Log sheet (spec §8, §13.11): 40 runners on one A4 landscape page, 45 on two, boxes at
  // least 16 × 7 mm, nothing clipped, at 100% in Chrome print.
  for (const n of [40, 45]) {
    await page.emulateMediaType('screen');
    await page.goto(`${url}#/cards?sheet=gym&sample=${n}`, { waitUntil: 'load' });
    await page.waitForSelector('.gym-page .gs-table', { timeout: 15000 });
    await page.emulateMediaType('print');
    await new Promise((r) => setTimeout(r, 400));
    const gym = await page.evaluate(() => {
      const MM = 96 / 25.4;
      const issues = [];
      const pages = [...document.querySelectorAll('.gym-page')];
      const inside = (a, b, tol = 0.6) => a.left >= b.left - tol && a.top >= b.top - tol && a.right <= b.right + tol && a.bottom <= b.bottom + tol;
      let rows = 0;
      pages.forEach((pg, pi) => {
        const pr = pg.getBoundingClientRect();
        if (Math.abs(pr.width - 297 * MM) > 1.5 * MM || Math.abs(pr.height - 210 * MM) > 1.5 * MM) issues.push(`page ${pi + 1} is ${(pr.width / MM).toFixed(1)}×${(pr.height / MM).toFixed(1)} mm`);
        pg.querySelectorAll('.gs-header, .gs-legend, .gs-footer, .gs-table, th, td').forEach((el) => {
          const er = el.getBoundingClientRect();
          if (!inside(er, pr)) issues.push(`page ${pi + 1}: ${el.className || el.tagName} "${(el.textContent || '').trim().slice(0, 30)}" falls outside the page`);
        });
        pg.querySelectorAll('.gs-header h1, .gs-legend, .gs-footer, .gs-label, th').forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) issues.push(`page ${pi + 1}: "${(el.textContent || '').trim().slice(0, 30)}" is clipped`);
        });
        pg.querySelectorAll('.gs-name').forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) issues.push(`page ${pi + 1}: name "${el.textContent.trim()}" is clipped`);
        });
        pg.querySelectorAll('tbody tr').forEach((tr) => {
          rows++;
          tr.querySelectorAll('td:not(.gs-name)').forEach((td) => {
            const r = td.getBoundingClientRect();
            if (r.width < 16 * MM - 0.5 || r.height < 7 * MM - 0.5) issues.push(`box ${(r.width / MM).toFixed(1)}×${(r.height / MM).toFixed(1)} mm is under 16×7 mm`);
          });
        });
      });
      const text = document.querySelector('.gym-sheets')?.textContent ?? '';
      return { pages: pages.length, rows, issues: [...new Set(issues)], leaks: /\b(OVR|streak|freeze|frost)\b/i.test(text) };
    });
    const want = n === 40 ? 1 : 2;
    check(`Gym Log sheet: ${n} runners on ${want} A4 landscape page${want > 1 ? 's' : ''}`, gym.pages === want && gym.rows === n, `${gym.rows} rows on ${gym.pages} pages`);
    check(`Gym Log sheet (${n}): boxes ≥ 16 × 7 mm, nothing clipped`, gym.issues.length === 0, gym.issues.slice(0, 12).join('\n'));
    check(`Gym Log sheet (${n}): no ratings, streaks or freezes printed`, !gym.leaks);
    const gpdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, scale: 1 });
    writeFileSync(join(outDir, `gym-sheet-${n}.pdf`), gpdf);
    const gtext = Buffer.from(gpdf).toString('latin1');
    const gpages = (gtext.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const gbox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(gtext);
    check(`Gym Log sheet (${n}): PDF is ${want} A4 landscape page${want > 1 ? 's' : ''} at 100%`, gpages === want && !!gbox && Math.abs(+gbox[1] - 841.89) < 2 && Math.abs(+gbox[2] - 595.28) < 2, `${gpages} pages, ${gbox?.[1]} × ${gbox?.[2]} pt`);
    if (n === 40) {
      const first = await page.$('.gym-page');
      if (first) await first.screenshot({ path: join(outDir, 'gym-sheet-40.png') });
    }
  }

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
