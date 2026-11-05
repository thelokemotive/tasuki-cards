// "Drop in data by whatever" (go-live plan 7): read the first sheet of an .xlsx file into tab-separated
// text for Paste & Match, with no library. An .xlsx is a zip of XML files; entries are stored or
// deflated, and the browser's own DecompressionStream('deflate-raw') inflates them (Chrome 103+, and
// Node 21+ for the tests). Ported from scripts/convert-age-tables.mjs, plus Excel's time and date cells.

/** Inflate raw deflate data (zip method 8). */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every entry of a zip file by name (central directory walk; stored and deflated entries). */
export async function unzip(buf: Uint8Array, inflate: (d: Uint8Array) => Promise<Uint8Array> = inflateRaw): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  let eocd = buf.length - 22;
  while (eocd >= 0 && u32(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('This is not an .xlsx file (no zip directory found).');
  const count = u16(eocd + 10);
  let p = u32(eocd + 16);
  const dec = new TextDecoder('utf-8');
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (u32(p) !== 0x02014b50) throw new Error('The .xlsx file is damaged (bad zip directory).');
    const method = u16(p + 10);
    const compSize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const localOff = u32(p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = localOff + 30 + u16(localOff + 26) + u16(localOff + 28);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await inflate(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Text of a <si> or <is> element: all <t> runs joined (rich text), phonetic <rPh> runs left out. */
function richText(xml: string): string {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...noPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
}

type CellKind = 'time' | 'date' | 'datetime' | 'number';

/** Built-in Excel number formats that are dates or times (ECMA-376 18.8.30). */
const BUILTIN: Record<number, CellKind> = { 14: 'date', 15: 'date', 16: 'date', 17: 'date', 18: 'time', 19: 'time', 20: 'time', 21: 'time', 22: 'datetime', 45: 'time', 46: 'time', 47: 'time' };

function kindOfFormat(code: string): CellKind {
  // Ignore quoted text, escaped characters and [Red]/[$-411] codes, but keep elapsed [h] [mm] [ss].
  const c = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '').toLowerCase();
  const hasTime = /[hs]/.test(c);
  const hasDate = /[yd]/.test(c);
  if (hasTime && hasDate) return 'datetime';
  if (hasTime) return 'time';
  if (hasDate) return 'date';
  return 'number';
}

/** Style index → what its number format shows. */
function cellKinds(styles: string | undefined): { kinds: CellKind[]; hours: boolean[] } {
  if (!styles) return { kinds: [], hours: [] };
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'numFmtId');
    const code = attr(m[1], 'formatCode');
    if (id && code) custom.set(Number(id), decodeXml(code));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  const kinds: CellKind[] = [];
  const hours: boolean[] = [];
  for (const m of xfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    const id = Number(attr(m[1], 'numFmtId') ?? 0);
    const code = custom.get(id);
    kinds.push(code ? kindOfFormat(code) : BUILTIN[id] ?? 'number');
    hours.push(code ? /h/i.test(code) : id !== 45 && id !== 47);
  }
  return { kinds, hours };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Fraction of a day → '16:15' (minutes:seconds) or '1:02:33' / '16:15:00' (with hours). Tenths kept. */
export function excelTime(v: number, withHours: boolean): string {
  const tenths = Math.round((v % 1) * 864000);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10 ? `.${tenths % 10}` : '';
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (withHours || h > 0) return `${h}:${pad(m)}:${pad(s)}${frac}`;
  return `${m}:${pad(s)}${frac}`;
}

/** Excel serial date (1900 system) → 'YYYY-MM-DD'. */
export function excelDate(serial: number): string {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

export interface SheetRead {
  sheetName: string;
  rows: string[][];
  /** Tab-separated text, ready for Paste & Match. */
  text: string;
}

/** Read the first sheet of an .xlsx workbook. */
export async function readXlsxFirstSheet(buf: Uint8Array, inflate?: (d: Uint8Array) => Promise<Uint8Array>): Promise<SheetRead> {
  const files = await unzip(buf, inflate);
  const dec = new TextDecoder('utf-8');
  const text = (n: string) => {
    const b = files.get(n);
    return b ? dec.decode(b) : undefined;
  };
  const wb = text('xl/workbook.xml');
  if (!wb) throw new Error('This file has no workbook inside: is it really an .xlsx (not an old .xls)?');
  const first = /<sheet\b([^>]*)\/?>/.exec(wb);
  if (!first) throw new Error('The workbook has no sheets.');
  const sheetName = decodeXml(attr(first[1], 'name') ?? 'Sheet1');
  const rid = attr(first[1], 'r:id');
  const rels = text('xl/_rels/workbook.xml.rels') ?? '';
  let target: string | undefined;
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) if (attr(m[1], 'Id') === rid) target = attr(m[1], 'Target');
  const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const xml = text(path) ?? text('xl/worksheets/sheet1.xml');
  if (!xml) throw new Error(`Could not find the sheet “${sheetName}” inside the file.`);
  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1]));
  const { kinds, hours } = cellKinds(text('xl/styles.xml'));

  const rows: string[][] = [];
  let rowNo = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = attr(rm[1], 'r');
    rowNo = r ? Number(r) - 1 : rowNo + 1;
    const row: string[] = [];
    let col = -1;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      col = ref ? colIndex(/^[A-Z]+/.exec(ref)?.[0] ?? 'A') : col + 1;
      const t = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let out = '';
      if (t === 's' && v != null) out = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') out = richText(body);
      else if (t === 'str' || t === 'e') out = v != null ? decodeXml(v) : '';
      else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) {
        const num = Number(v);
        const style = Number(attr(cm[1], 's') ?? 0);
        const kind = kinds[style] ?? 'number';
        if (!Number.isFinite(num)) out = decodeXml(v);
        else if (kind === 'time') out = excelTime(num, hours[style] ?? true);
        else if (kind === 'date') out = excelDate(num);
        else if (kind === 'datetime') out = `${excelDate(num)} ${excelTime(num % 1, true)}`;
        else out = String(Number(num.toPrecision(12)));
      }
      row[col] = out.replace(/[\t\r\n]+/g, ' ').trim();
    }
    rows[rowNo] = Array.from(row, (x) => x ?? '');
  }
  const kept = rows.filter((r) => r && r.some((c) => c));
  return { sheetName, rows: kept, text: kept.map((r) => r.join('\t')).join('\n') };
}

/** Decode a text file: UTF-8 (with or without BOM), else Shift_JIS (Excel's CSV on Japanese Windows). */
export function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(buf);
    } catch {
      return new TextDecoder('utf-8').decode(buf);
    }
  }
}

export type DroppedKind = 'text' | 'xlsx' | 'pdf' | 'xls' | 'unknown';

export function droppedKind(name: string): DroppedKind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv' || ext === 'text') return 'text';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xls') return 'xls';
  return 'unknown';
}
