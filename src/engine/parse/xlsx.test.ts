import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { decodeText, droppedKind, excelDate, excelTime, readXlsxFirstSheet, unzip } from './xlsx';
import { buildImportPlan } from './plan';
import { DEFAULT_CONFIG } from '../config';
import { SCHEMA_VERSION } from '../../types';
import { seedCourses } from '../../demo/demoData';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name)));

/** A minimal zip writer (one deflated, one stored entry) to test the reader on its own. */
function zip(entries: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const body = e.deflate ? new Uint8Array(deflateRawSync(e.data)) : e.data;
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(8, e.deflate ? 8 : 0, true);
    dv.setUint32(18, body.length, true);
    dv.setUint32(22, e.data.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, e.deflate ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, off, true);
    cen.set(name, 46);
    parts.push(local, body);
    central.push(cen);
    off += local.length + body.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, off, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of all) (out.set(a, p), (p += a.length));
  return out;
}

describe('zip reader', () => {
  it('reads stored and deflated entries (DecompressionStream deflate-raw)', async () => {
    const enc = new TextEncoder();
    const z = zip([
      { name: 'a.txt', data: enc.encode('hello hello hello hello'), deflate: true },
      { name: 'b.txt', data: enc.encode('stored'), deflate: false },
    ]);
    const files = await unzip(z);
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello hello hello hello');
    expect(new TextDecoder().decode(files.get('b.txt'))).toBe('stored');
  });

  it('refuses a file that is not a zip', async () => {
    await expect(unzip(new TextEncoder().encode('just text, not a zip at all'))).rejects.toThrow(/not an \.xlsx/);
  });
});

describe('Excel cell values', () => {
  it('times: fraction of a day', () => {
    expect(excelTime((16 * 60 + 15) / 86400, false)).toBe('16:15');
    expect(excelTime((16 * 60 + 15) / 86400, true)).toBe('0:16:15');
    expect(excelTime((16 * 3600 + 15 * 60) / 86400, true)).toBe('16:15:00');
    expect(excelTime((3600 + 2 * 60 + 33) / 86400, false)).toBe('1:02:33');
    expect(excelTime((12 * 60 + 5.3) / 86400, false)).toBe('12:05.3');
  });
  it('dates: 1900 serials', () => {
    expect(excelDate(46334)).toBe('2026-11-08');
    expect(excelDate(45658.75)).toBe('2025-01-01');
  });
});

describe('readXlsxFirstSheet on real files', () => {
  for (const name of ['results-openpyxl.xlsx', 'results-libreoffice.xlsx']) {
    it(`${name}: first sheet, Japanese headers, times, dates, the Excel 16:15 hazard`, async () => {
      const s = await readXlsxFirstSheet(fixture(name));
      expect(s.sheetName).toBe('結果');
      expect(s.rows[0]).toEqual(['順位', '氏名', '所属', '種目', '記録', '日付']);
      expect(s.rows[1]).toEqual(['1', '盛岡 太郎', '盛岡RC', '男子', '10:01', '2026-11-08']);
      expect(s.rows[3][1]).toBe('Ben & Sampleton');
      expect(s.rows[4][4]).toBe('16:15:00');
      expect(s.rows[5].slice(0, 5)).toEqual(['5', 'Kenji Demoyama', 'Harrow', '男子', '12:05.3']);
      expect(s.text.split('\n')).toHaveLength(6);
      expect(s.text).not.toContain('ignore me');
    });
  }

  it('the sheet goes straight into Paste & Match', async () => {
    const s = await readXlsxFirstSheet(fixture('results-openpyxl.xlsx'));
    const snapshot = { schemaVersion: SCHEMA_VERSION, athletes: [], courses: seedCourses(), events: [], performances: [], participation: [], achievements: [], configs: [DEFAULT_CONFIG], calendar: { holidayWeeks: [], halfTerms: [] }, meta: {} };
    const plan = buildImportPlan(s.text, { snapshot, config: DEFAULT_CONFIG, today: '2026-11-10', defaults: { name: 'Test 3K', perfKind: 'race', distanceKm: 3 }, ourSchool: ['Harrow'] });
    expect(plan.format).toBe('table');
    expect(plan.rows.map((r) => r.raw.timeSec)).toEqual([601, 690, 760, 58500, 725.3]);
    expect(plan.sections[0].date).toBe('2026-11-08');
    expect(plan.rows.filter((r) => r.academy)).toHaveLength(4);
  });
});

describe('dropped files', () => {
  it('kinds by extension', () => {
    expect(['a.csv', 'b.TXT', 'c.tsv', 'd.xlsx', 'e.pdf', 'f.xls', 'g.docx'].map(droppedKind)).toEqual(['text', 'text', 'text', 'xlsx', 'pdf', 'xls', 'unknown']);
  });
  it('UTF-8 (with BOM) and Shift_JIS CSVs', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('氏名,記録')]))).toBe('氏名,記録');
    // 氏名 in Shift_JIS: 8E 81 96 BC
    expect(decodeText(new Uint8Array([0x8e, 0x81, 0x96, 0xbc]))).toBe('氏名');
  });
});
