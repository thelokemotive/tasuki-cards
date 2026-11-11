// Two "laziest possible data" readers that turn text into a format the rest of Paste & Match already handles:
// 1. Japanese results booklets (the ISTS layout used at Hachimantai XC: 順位 ナンバー 氏名 氏名(カナ) 市区町村県名
//    所属クラブ名 記録, one category per page, e.g. 一般男子4km). Each category becomes its own event, with its
//    distance, the club column (so ハロウ安比校 runners are spotted) and the category (so sex is inferred).
// 2. Ekiden write-ups: "🥇 Samurai Blue (1st, general): 34:25" then "Daichi (9:18) → Dori (8:26) → …".
// Both work on text copied from a PDF viewer or a website, with columns separated by single or many spaces.

const TIME_RE = /(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?|\d{1,3}:\d{2}(?:\.\d+)?)\s*$/;
const HALF_KANA = /[ｦ-ﾟ]/;
const PREF_RE = /^[^\s]{1,4}[都道府県]$/;
const CITY_RE = /^[^\s]+[市町村区郡]$/;

export interface BookletRead {
  /** Tab-separated table with headers the table parser understands. */
  text: string;
  categories: string[];
  rows: number;
}

/** True when the text looks like a Japanese timing-company booklet. */
export function looksLikeBooklet(text: string): boolean {
  const t = text.normalize('NFKC');
  return /順位/.test(t) && /(記\s*録|タイム)/.test(t) && t.split(/\r?\n/).filter((l) => /^\s*\d+\s+\d{1,5}\s+\S/.test(l) && TIME_RE.test(l)).length >= 2;
}

/** Category lines such as 一般男子10km（40歳未満）, 中学生女子4km, 小学生（5・6年）男子2km. */
function categoryOf(line: string): { name: string; km: number } | undefined {
  const t = line.trim();
  if (!t || TIME_RE.test(t) || /順位/.test(t)) return undefined;
  const m = /(\d+(?:\.\d+)?)\s*(km|ｋｍ|キロ)/i.exec(t.normalize('NFKC'));
  if (!m) return undefined;
  if (/大会/.test(t) && !/(男|女|一般|中学|小学|高校|ペア)/.test(t)) return undefined;
  return { name: t.replace(/\s{2,}.*$/, '').normalize('NFKC'), km: Number(m[1]) };
}

export function bookletToTable(text: string): BookletRead | undefined {
  if (!looksLikeBooklet(text)) return undefined;
  const lines = text.split(/\r?\n/);
  const all = text.normalize('NFKC');
  const title = (/(\d{4}\s*\S*?大会)/.exec(all)?.[1] ?? /(\S*大会)/.exec(all)?.[1] ?? '').replace(/\s+/g, '');
  const d = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(all);
  const date = d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : '';
  const out: string[] = ['大会名\t日付\t順位\t氏名\t所属\t種目\t距離\t記録'];
  const categories: string[] = [];
  let cat: { name: string; km: number } | undefined;
  let rows = 0;
  for (const raw of lines) {
    const c = categoryOf(raw);
    if (c) {
      cat = c;
      if (!categories.includes(c.name)) categories.push(c.name);
      continue;
    }
    const line = raw.trim();
    const tm = TIME_RE.exec(line);
    const head = /^(\d+)\s+(\d{1,5})\s+(.*)$/.exec(line);
    if (!tm || !head || !cat) continue;
    const place = head[1];
    const tokens = head[3].slice(0, head[3].length - (line.length - tm.index)).trim().split(/\s+/).filter(Boolean);
    // name = tokens before the half-width kana reading; then kana; then prefecture + town; then the club
    let i = 0;
    const name: string[] = [];
    while (i < tokens.length && !HALF_KANA.test(tokens[i]) && !PREF_RE.test(tokens[i])) name.push(tokens[i++]);
    while (i < tokens.length && HALF_KANA.test(tokens[i]) && !PREF_RE.test(tokens[i])) i++;
    if (i < tokens.length && PREF_RE.test(tokens[i])) i++;
    if (i < tokens.length && CITY_RE.test(tokens[i])) i++;
    const club = tokens.slice(i).join(' ');
    let time = tm[1];
    if (/^0:\d{2}:\d{2}/.test(time)) time = time.slice(2); // 0:15:21 → 15:21 (no hours)
    if (!name.length) continue;
    const event = [title, cat.name].filter(Boolean).join(' ');
    out.push([event, date, place, name.join(' ').normalize('NFKC'), club.normalize('NFKC'), cat.name, `${cat.km} km`, time].join('\t'));
    rows++;
  }
  return rows ? { text: out.join('\n'), categories, rows } : undefined;
}

// ---------------------------------------------------------------------------------------------------
// Ekiden write-ups

const LEG_RE = /([^()→>]+?)\s*\(\s*(\d{1,2}:\d{2}(?:\.\d+)?)\s*\)/g;

export function looksLikeEkidenWriteUp(text: string): boolean {
  return /(→|->)/.test(text) && /\(\s*\d{1,2}:\d{2}/.test(text) && !/^\s*#/m.test(text.replace(/^#\s*event:.*$/gm, ''));
}

/**
 * Turn an ekiden write-up into the Tasuki line format: one relay leg per runner, numbered in order, with the
 * team from the line above. The leg distance comes from a '# event' header if there is one, else from the
 * write-up ("flat 2 km legs"), else from the event chosen above the paste box.
 */
export function ekidenToLineFormat(text: string, defaults: { name?: string; date?: string; distanceKm?: number } = {}): { text: string; teams: number; legs: number } | undefined {
  if (!looksLikeEkidenWriteUp(text)) return undefined;
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const header = lines.find((l) => /^\s*#\s*event:/i.test(l));
  if (header) out.push(header.trim());
  else {
    const km = /(\d+(?:\.\d+)?)\s*km\s*legs?/i.exec(text)?.[1] ?? /(\d+(?:\.\d+)?)\s*km/i.exec(text)?.[1];
    const dist = km ? Number(km) : defaults.distanceKm;
    out.push(`# event: ${defaults.name || 'Ekiden'}${defaults.date ? ` | ${defaults.date}` : ''} | relay_leg${dist ? ` | ${dist} km` : ''}`);
  }
  let team = '';
  let teams = 0;
  let legs = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || /^#/.test(l)) continue;
    if (/(→|->)/.test(l) && /\(\s*\d{1,2}:\d{2}/.test(l)) {
      let n = 0;
      for (const m of l.matchAll(LEG_RE)) {
        const name = m[1].replace(/^[\s→>-]+/, '').trim();
        if (!name) continue;
        n++;
        legs++;
        out.push(`${name}, ${m[2]}, leg ${n}${team ? `, team ${team}` : ''}`);
      }
      continue;
    }
    // A team line: "…🥇 Samurai Blue (1st, general): 34:25". The team is the text just before "(1st",
    // after any medal emoji or earlier sentence.
    const t = /^(.*?)\(\s*\d+(?:st|nd|rd|th)\b[^)]*\)\s*:?\s*\d/u.exec(l);
    if (t) {
      const name = t[1].split(/[\p{Extended_Pictographic})\]]/u).pop()!.trim();
      if (name) {
        team = name;
        teams++;
      }
    }
  }
  return legs ? { text: out.join('\n'), teams, legs } : undefined;
}
