// Splitting pasted text into cells: tabs (Excel), commas (CSV with quotes, Forms exports), or runs of
// 2+ spaces (PDFs and websites). Lines with single spaces only are left whole for free-text parsing.

export type Delimiter = 'tab' | 'comma' | 'spaces' | 'none';

/** Full-width forms of the separators we care about → ASCII (the rest of the text is left as typed). */
export function normaliseSeparators(line: string): string {
  return line.replace(/　/g, '  ').replace(/，/g, ',').replace(/｜/g, '|').replace(/\r$/, '');
}

/** RFC-4180-style CSV split of one line (quotes may contain commas; "" is an escaped quote). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') {
      q = true;
      cur = '';
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Join physical lines where a quoted CSV field spans a line break (Forms free-text answers). */
export function joinQuotedLines(lines: string[]): string[] {
  const out: string[] = [];
  let buf: string | null = null;
  for (const l of lines) {
    const piece: string = buf == null ? l : `${buf}\n${l}`;
    const quotes = (piece.match(/"/g) ?? []).length;
    if (quotes % 2 === 1) buf = piece;
    else {
      out.push(piece);
      buf = null;
    }
  }
  if (buf != null) out.push(buf);
  return out;
}

/** Pick the delimiter that splits most lines into a consistent number (≥ 2) of cells. */
export function detectDelimiter(lines: string[]): Delimiter {
  const sample = lines.filter((l) => l.trim()).slice(0, 40);
  if (!sample.length) return 'none';
  const score = (counts: number[]) => {
    const multi = counts.filter((c) => c >= 2);
    if (multi.length < Math.max(1, Math.ceil(sample.length * 0.6))) return 0;
    const freq = new Map<number, number>();
    for (const c of multi) freq.set(c, (freq.get(c) ?? 0) + 1);
    return Math.max(...freq.values()) / sample.length;
  };
  const tab = score(sample.map((l) => l.split('\t').length));
  if (tab >= 0.5) return 'tab';
  const comma = score(sample.map((l) => splitCsvLine(l).length));
  const spaces = score(sample.map((l) => l.trim().split(/\s{2,}/).length));
  if (comma >= 0.5 && comma >= spaces) return 'comma';
  if (spaces >= 0.5) return 'spaces';
  return 'none';
}

export function splitLine(line: string, d: Delimiter): string[] {
  switch (d) {
    case 'tab':
      return line.split('\t').map((c) => c.trim());
    case 'comma':
      return splitCsvLine(line);
    case 'spaces':
      return line.trim().split(/\s{2,}/).map((c) => c.trim());
    default:
      return [line.trim()];
  }
}
