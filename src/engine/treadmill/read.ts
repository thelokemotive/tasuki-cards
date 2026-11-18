// Reading a treadmill console from a photo (seven-segment LED digits), entirely on the device.
//
// The school's treadmills show four lit readouts: distance (km, 3 decimals) and time (min:sec) on the top
// row, incline (%) and speed (km/h) below. The reader:
//   1. keeps the bright, saturated pixels of the display's own colour (the most common lit hue), so the
//      white panel, the window and the blue runner-sensor light drop out;
//   2. joins them into blobs, finds the digit height, and groups the blobs into rows and then readouts;
//   3. straightens the italic slant of each readout, cuts it into characters by column, and reads each
//      digit from which of its seven segments are lit (a small mark high up is the colon);
//   4. names the readouts by where they sit (and a colon always means time), and places the decimal point
//      from the console's fixed format: distance 0.000, incline and speed 0.0.
// Nothing here touches the network or the DOM: it takes plain pixels, so it is tested in Node with a real
// photo of the console (fixtures/) and with drawn digits.

export interface Pixels {
  width: number;
  height: number;
  /** RGBA (4 channels, as from a canvas) or RGB (3). */
  data: Uint8ClampedArray | Uint8Array;
  channels?: 3 | 4;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ReadoutRole = 'distance' | 'time' | 'incline' | 'speed';

export interface Readout {
  /** What the display shows, e.g. "0.024", "0:37"; "?" for a digit that could not be read. */
  text: string;
  box: Box;
  role?: ReadoutRole;
  /** 0–1: how cleanly the weakest digit matched a seven-segment pattern. */
  confidence: number;
}

export interface TreadmillReading {
  distanceKm?: number;
  timeSec?: number;
  inclinePct?: number;
  speedKmh?: number;
  readouts: Readout[];
  /** Around all the readouts, with a margin: the part of the photo worth keeping as evidence. */
  displayBox?: Box;
  /** Plain-English reasons a value is missing or doubtful. */
  warnings: string[];
}

// ---------------------------------------------------------------------------------------------------
// 1. Lit pixels

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function percentile(values: Float32Array | number[], q: number): number {
  if (!values.length) return 0;
  const s = Float32Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * 1 where the pixel is a lit segment of the display's colour. Thresholds follow the photo's own exposure
 * (a dim photo, or one taken from further away, still works), and an overexposed segment whose core has
 * gone white is kept when its own coloured glow surrounds it.
 */
export function litMask(img: Pixels): Uint8Array {
  const { width, height, data } = img;
  const ch = img.channels ?? (data.length >= width * height * 4 ? 4 : 3);
  const n = width * height;
  const value = new Float32Array(n);
  const chroma = new Float32Array(n);
  const hue = new Float32Array(n).fill(-1);
  const colourful: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = data[i * ch];
    const g = data[i * ch + 1];
    const b = data[i * ch + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    value[i] = max;
    chroma[i] = max - min;
    if (max >= 40 && max - min >= 25 && (max - min) / max >= 0.3) {
      hue[i] = hueOf(r, g, b, max, min);
      colourful.push(i);
    }
  }
  // How bright the brightest coloured light in the photo is: the lit segments.
  const sample = colourful.length > 20000 ? colourful.filter((_, k) => k % Math.ceil(colourful.length / 20000) === 0) : colourful;
  const topV = percentile(sample.map((i) => value[i]), 0.995);
  const topC = percentile(sample.map((i) => chroma[i]), 0.995);
  const vMin = Math.max(55, 0.5 * topV);
  const cMin = Math.max(28, 0.3 * topC);
  const bins = new Float64Array(36);
  for (const i of colourful) if (value[i] >= vMin && chroma[i] >= cMin) bins[Math.floor(hue[i] / 10) % 36] += chroma[i];
  // The display's colour: the heaviest 30° window of lit hue.
  let best = 0;
  let bestW = -1;
  for (let k = 0; k < 36; k++) {
    const w = bins[(k + 35) % 36] + bins[k] + bins[(k + 1) % 36];
    if (w > bestW) {
      bestW = w;
      best = k;
    }
  }
  const centre = best * 10 + 5;
  const inHue = (i: number) => Math.abs(((hue[i] - centre + 540) % 360) - 180) <= 40;
  // Glow: a blurred or overexposed photo spreads a dimmer halo of the same colour around each segment.
  // Otsu's threshold on the brightness of that colour separates the segments from their halo.
  const hist = new Float64Array(256);
  let total = 0;
  for (const i of colourful) {
    if (value[i] >= vMin && chroma[i] >= cMin && inHue(i)) {
      hist[Math.round(value[i])]++;
      total++;
    }
  }
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * hist[v];
  let wB = 0;
  let sumB = 0;
  let otsu = 0;
  let bestVar = -1;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB || wB === total) continue;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > bestVar) {
      bestVar = between;
      otsu = v;
    }
  }
  const vCut = Math.max(vMin, Math.min(otsu, 0.8 * topV));
  const mask = new Uint8Array(n);
  for (const i of colourful) if (value[i] >= vCut && chroma[i] >= cMin && inHue(i)) mask[i] = 1;
  // Blown-out cores: near-white pixels in patches that the lit colour surrounds.
  const blownV = Math.max(200, topV - 15);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || mask[start] || value[start] < blownV || chroma[start] >= cMin) continue;
    const patch: number[] = [];
    let edge = 0;
    let lit = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      patch.push(i);
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) {
          edge++;
          continue;
        }
        const j = yy * width + xx;
        if (mask[j]) {
          edge++;
          lit++;
        } else if (!seen[j] && value[j] >= blownV && chroma[j] < cMin) {
          seen[j] = 1;
          stack.push(j);
        } else if (!seen[j] || !(value[j] >= blownV && chroma[j] < cMin)) edge++;
      }
    }
    if (patch.length <= n / 200 && lit >= 0.6 * edge) for (const i of patch) mask[i] = 1;
  }
  return mask;
}

// ---------------------------------------------------------------------------------------------------
// 2. Blobs

interface Blob {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  pixels: number[];
}

function blobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const b: Blob = { x0: width, y0: height, x1: -1, y1: -1, area: 0, pixels: [] };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      b.pixels.push(i);
      b.area++;
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    out.push(b);
  }
  return out;
}

const bh = (b: Blob) => b.y1 - b.y0 + 1;
const bw = (b: Blob) => b.x1 - b.x0 + 1;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Digit height. Sharp photos split a digit into separate segments (each about half the digit high or
 * less); blurred ones give one blob per digit or a whole readout. So: the tallest blobs, and when the
 * stack of a column of blobs is taller than any single blob, that stack.
 */
function digitHeight(bs: Blob[]): number {
  const tall = [...bs].sort((a, b) => bh(b) - bh(a));
  if (!tall.length) return 0;
  // Column stacks: blobs overlapping in x and close in y, as the upper and lower verticals of one digit.
  let best = bh(tall[0]);
  for (const a of tall.slice(0, 40)) {
    for (const b of tall.slice(0, 40)) {
      if (a === b || b.y0 <= a.y1) continue;
      const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const gap = b.y0 - a.y1;
      const h = b.y1 - a.y0 + 1;
      if (overlap >= -2 && gap <= 0.25 * h && Math.abs(bh(a) - bh(b)) <= 0.35 * Math.max(bh(a), bh(b)) && h > best && h < 2.4 * Math.max(bh(a), bh(b))) best = h;
    }
  }
  const candidates = tall.filter((b) => bh(b) >= 0.6 * best);
  // A single stray tall blob should not set the height when most digits agree on a smaller one.
  return candidates.length >= 3 ? Math.max(median(candidates.map(bh)), best * 0.8) : best;
}

// ---------------------------------------------------------------------------------------------------
// 3. Characters

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
/** Segment patterns, a–g. Several displays draw 6, 7 and 9 two ways. */
const PATTERNS: [string, string][] = [
  ['0', 'abcdef'],
  ['1', 'bc'],
  ['2', 'abdeg'],
  ['3', 'abcdg'],
  ['4', 'bcfg'],
  ['5', 'acdfg'],
  ['6', 'acdefg'],
  ['6', 'cdefg'],
  ['7', 'abc'],
  ['7', 'abcf'],
  ['8', 'abcdefg'],
  ['9', 'abcdfg'],
  ['9', 'abcfg'],
];

/** Sample regions (fractions of the digit box): [x0, x1, y0, y1]. */
const REGION: Record<(typeof SEGMENTS)[number], [number, number, number, number]> = {
  a: [0.3, 0.7, 0, 0.17],
  b: [0.7, 1, 0.14, 0.42],
  c: [0.7, 1, 0.58, 0.86],
  d: [0.3, 0.7, 0.83, 1],
  e: [0, 0.3, 0.58, 0.86],
  f: [0, 0.3, 0.14, 0.42],
  g: [0.3, 0.7, 0.42, 0.58],
};

interface Grid {
  w: number;
  h: number;
  on: Uint8Array;
}

function fill(g: Grid, x0: number, x1: number, y0: number, y1: number): number {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(g.w, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(g.h, Math.ceil(y1));
  let n = 0;
  let on = 0;
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      n++;
      on += g.on[y * g.w + x];
    }
  }
  return n ? on / n : 0;
}

/** The digit whose pattern best explains the segment fills, with a 0–1 confidence. */
export function decodeSegments(fills: number[]): { digit: string; confidence: number } {
  const ref = Math.max(0.25, ...fills);
  const level = fills.map((f) => Math.min(1, f / (ref * 0.75)));
  const cost = (pattern: string) => SEGMENTS.reduce((s, seg, i) => s + Math.abs(level[i] - (pattern.includes(seg) ? 1 : 0)), 0);
  const scored = PATTERNS.map(([d, p]) => ({ d, c: cost(p) })).sort((a, b) => a.c - b.c);
  const best = scored[0];
  const next = scored.find((s) => s.d !== best.d)!;
  const confidence = Math.max(0, Math.min(1, next.c - best.c)) * Math.max(0, 1 - best.c / 2.5);
  return { digit: best.d, confidence };
}

/**
 * Read one readout from the lit pixels of its digits (image coordinates). H = digit height; `colons` are
 * the centres of small marks high up (a colon's dots), placed by position among the digits.
 * Returns the digits (and a colon where one is seen) and the weakest digit's confidence. Decimal points are
 * not read: on this console they blur into the next digit, and every readout has a fixed number of decimals.
 */
function readField(pixels: number[], width: number, H: number, colons: { x: number; y: number }[]): { text: string; confidence: number } {
  const xs = pixels.map((i) => i % width);
  const ys = pixels.map((i) => (i - (i % width)) / width);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const fieldH = bottom - top + 1;
  const yMid = (top + bottom) / 2;

  // Straighten the slant: the shear that leaves the fewest occupied columns (upright strokes stack).
  let bestShear = 0;
  let bestCols = Infinity;
  for (let deg = -24; deg <= 24; deg += 1) {
    const t = Math.tan((deg * Math.PI) / 180);
    const cols = new Set<number>();
    for (let k = 0; k < xs.length; k++) cols.add(Math.round(xs[k] + t * (ys[k] - yMid)));
    if (cols.size < bestCols || (cols.size === bestCols && Math.abs(deg) < Math.abs(bestShear))) {
      bestCols = cols.size;
      bestShear = deg;
    }
  }
  const s = Math.tan((bestShear * Math.PI) / 180);
  const sx = xs.map((x, k) => Math.round(x + s * (ys[k] - yMid)));
  const left = Math.min(...sx);
  const gw = Math.max(...sx) - left + 1;
  const g: Grid = { w: gw, h: fieldH, on: new Uint8Array(gw * fieldH) };
  for (let k = 0; k < sx.length; k++) g.on[(ys[k] - top) * gw + (sx[k] - left)] = 1;

  // Columns, using only the upper 72%: a decimal point stuck low between two digits would join them.
  const cut = Math.floor(fieldH * 0.72);
  const colUpper = new Array<number>(gw).fill(0);
  for (let y = 0; y < cut; y++) for (let x = 0; x < gw; x++) colUpper[x] += g.on[y * gw + x];
  const raw: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= gw; x++) {
    const on = x < gw && colUpper[x] > 0;
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      raw.push([start, x - 1]);
      start = -1;
    }
  }
  const extent = (x0: number, x1: number) => {
    let y0 = fieldH;
    let y1 = -1;
    for (let y = 0; y < fieldH; y++) {
      for (let x = x0; x <= x1; x++) {
        if (g.on[y * gw + x]) {
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return { y0, y1, tall: (y1 - y0 + 1) / fieldH >= 0.55 };
  };
  // Sharp photos can leave a hairline gap inside one digit (between segments): join two runs across a gap
  // thinner than a segment when together they are still no wider than one digit.
  const minGap = Math.max(1, Math.round(H * 0.08));
  const runs: [number, number][] = [];
  for (const r of raw) {
    const last = runs[runs.length - 1];
    if (last && r[0] - last[1] - 1 < minGap && r[1] - last[0] + 1 <= 0.8 * H) last[1] = r[1];
    else runs.push([...r]);
  }

  // Typical digit width, from the runs that are about one digit wide.
  const widths = runs.map(([a, b]) => b - a + 1).filter((w) => w >= 0.35 * H && w <= 0.85 * H);
  const digitW = widths.length ? median(widths) : 0.55 * H;
  const chars: { x: number; text: string }[] = [];
  let conf = 1;
  for (const [a, b] of runs) {
    const w = b - a + 1;
    if (!extent(a, b).tall) continue; // a speck, or part of a decimal point
    // Two or three digits blurred into one run: split evenly.
    const n = w > 1.35 * digitW ? Math.max(2, Math.round(w / (digitW * 1.15))) : 1;
    for (let k = 0; k < n; k++) {
      const xa = Math.round(a + (k * w) / n);
      const xb = Math.round(a + ((k + 1) * w) / n) - 1;
      const cw = xb - xa + 1;
      if (cw < 0.45 * digitW) {
        chars.push({ x: (xa + xb) / 2, text: '1' });
        continue;
      }
      // Each digit's own top and bottom: a slight tilt puts neighbours a pixel or two higher or lower.
      const { y0, y1 } = extent(xa, xb);
      const dh = y1 - y0 + 1;
      const fills = SEGMENTS.map((seg) => {
        const [fx0, fx1, fy0, fy1] = REGION[seg];
        return fill(g, xa + fx0 * cw, xa + fx1 * cw, y0 + fy0 * dh, y0 + fy1 * dh);
      });
      const { digit, confidence } = decodeSegments(fills);
      chars.push({ x: (xa + xb) / 2, text: digit });
      conf = Math.min(conf, confidence);
    }
  }
  // A colon goes where its dots sit among the digits (one colon however many dots were seen).
  for (const c of colons) chars.push({ x: c.x + s * (c.y - yMid) - left, text: ':' });
  chars.sort((p, q) => p.x - q.x);
  return { text: chars.map((c) => c.text).join('').replace(/:+/g, ':').replace(/^:|:$/g, ''), confidence: conf };
}

// ---------------------------------------------------------------------------------------------------
// 4. Readouts and values

function unionBox(bs: Blob[]): Box {
  const x0 = Math.min(...bs.map((b) => b.x0));
  const y0 = Math.min(...bs.map((b) => b.y0));
  const x1 = Math.max(...bs.map((b) => b.x1));
  const y1 = Math.max(...bs.map((b) => b.y1));
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Find and read every readout in the photo. */
export function findReadouts(img: Pixels): { readouts: Readout[]; digitHeight: number } {
  const { width, height } = img;
  const mask = litMask(img);
  const all = blobs(mask, width, height).filter((b) => b.area >= 4);
  if (!all.length) return { readouts: [], digitHeight: 0 };
  const H = digitHeight(all);
  if (H < 8) return { readouts: [], digitHeight: H };
  // Specks far smaller than a decimal point are noise.
  const minArea = Math.max(4, (H * H) / 300);
  const kept = all.filter((b) => b.area >= minArea && bh(b) <= 1.6 * H && bw(b) <= 12 * H);
  // Readouts: blobs whose boxes, grown by a fraction of the digit height, touch (digits sit close
  // together; separate readouts are far apart).
  // A right-aligned 1 after a colon leaves almost a digit's width of dark: allow a little more than that.
  const grow = 1.1 * H;
  const parent = kept.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const a = kept[i];
      const b = kept[j];
      const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
      const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
      if (dx <= grow && dy <= 0.35 * H) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Blob[]>();
  kept.forEach((b, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), b]);
  });
  const readouts: Readout[] = [];
  for (const g of groups.values()) {
    const box = unionBox(g);
    // A readout is about one digit high: drop lone specks and anything much taller (a bar graph).
    if (box.h < 0.7 * H || box.h > 1.6 * H) continue;
    // Small round marks are punctuation, not digits: a colon's dots high and low, a decimal point low.
    // A segment on its own (a sharp photo) is long and thin, so it is never taken for a mark; and a colon
    // has nothing lit directly above or below it at the top or bottom of the digits (a 4's middle bar,
    // seen on its own, has nothing either, but it is long).
    const isMark = (b: Blob) => bh(b) <= 0.24 * H && bw(b) <= 0.24 * H && bw(b) / bh(b) >= 0.5 && bw(b) / bh(b) <= 2;
    const clearColumn = (m: Blob) =>
      !g.some((o) => o !== m && !isMark(o) && o.x0 <= m.x1 && o.x1 >= m.x0 && (o.y0 < box.y + 0.15 * box.h || o.y1 > box.y + 0.85 * box.h) && (o.y1 < m.y0 || o.y0 > m.y1));
    const digits = g.filter((b) => !isMark(b));
    if (!digits.length) continue;
    const colons = g
      .filter((b) => {
        if (!isMark(b) || !clearColumn(b)) return false;
        const mid = ((b.y0 + b.y1) / 2 - box.y) / box.h;
        return mid > 0.12 && mid < 0.45;
      })
      .map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }));
    const { text, confidence } = readField(digits.flatMap((b) => b.pixels), width, H, colons);
    if (!/\d/.test(text)) continue;
    readouts.push({ text, box, confidence });
  }
  return { readouts, digitHeight: H };
}

/** Name the readouts: rows top to bottom, left to right = distance, time, incline, speed; a colon is time. */
export function assignRoles(readouts: Readout[]): Readout[] {
  if (!readouts.length) return readouts;
  const cy = (r: Readout) => r.box.y + r.box.h / 2;
  const cx = (r: Readout) => r.box.x + r.box.w / 2;
  const order: ReadoutRole[] = ['distance', 'time', 'incline', 'speed'];
  let flat: Readout[];
  if (readouts.length === 4) {
    // Two rows of two, even with the phone tilted: the pairing whose pairs are most nearly level.
    const [p, q, r, t] = readouts;
    const pairings: [Readout[], Readout[]][] = [
      [[p, q], [r, t]],
      [[p, r], [q, t]],
      [[p, t], [q, r]],
    ];
    const slope = (pair: Readout[]) => Math.abs(cy(pair[0]) - cy(pair[1])) / Math.max(1, Math.abs(cx(pair[0]) - cx(pair[1])));
    const [rowA, rowB] = pairings.reduce((best, pr) => (slope(pr[0]) + slope(pr[1]) < slope(best[0]) + slope(best[1]) ? pr : best));
    const mean = (row: Readout[]) => (cy(row[0]) + cy(row[1])) / 2;
    flat = [...(mean(rowA) <= mean(rowB) ? [rowA, rowB] : [rowB, rowA])].flatMap((row) => [...row].sort((a, b) => cx(a) - cx(b)));
  } else {
    const H = median(readouts.map((r) => r.box.h));
    const rows: Readout[][] = [];
    for (const r of [...readouts].sort((a, b) => cy(a) - cy(b))) {
      const row = rows.find((rw) => Math.abs(cy(rw[0]) - cy(r)) < 0.9 * H);
      if (row) row.push(r);
      else rows.push([r]);
    }
    flat = rows.flatMap((row) => row.sort((a, b) => cx(a) - cx(b)));
  }
  const out = flat.map((r) => ({ ...r, role: undefined as ReadoutRole | undefined }));
  if (out.length === 4) out.forEach((r, i) => (r.role = order[i]));
  // A colon is always the time.
  const colon = out.find((r) => r.text.includes(':'));
  if (colon && colon.role !== 'time') {
    const wasTime = out.find((r) => r.role === 'time');
    if (wasTime) wasTime.role = colon.role;
    colon.role = 'time';
  }
  return out;
}

const digitsOnly = (t: string) => t.replace(/[^0-9]/g, '');

/** Digits of the distance readout → km: the console always shows three decimals ("0024" → 0.024). */
export function parseDistance(text: string): number | undefined {
  const d = digitsOnly(text);
  if (/\?/.test(text) || d.length < 2) return undefined;
  return Number(d) / 1000;
}

/** "0:37" → 37; "12:05" → 725; "1:02:33" → 3753; "1205" (colon missed) → 725. */
export function parseConsoleTime(text: string): number | undefined {
  if (/\?/.test(text)) return undefined;
  const parts = text.split(':').filter(Boolean).map(digitsOnly);
  if (parts.length >= 2 && parts.every((p) => p.length)) {
    const nums = parts.map(Number);
    if (nums.slice(1).some((n) => n >= 60)) return undefined;
    return nums.reduce((t, n) => t * 60 + n, 0);
  }
  const d = digitsOnly(text);
  if (d.length < 2) return undefined;
  const sec = Number(d.slice(-2));
  if (sec >= 60) return undefined;
  const rest = d.slice(0, -2);
  if (rest.length <= 2) return Number(rest || '0') * 60 + sec;
  const min = Number(rest.slice(-2));
  if (min >= 60) return undefined;
  return Number(rest.slice(0, -2)) * 3600 + min * 60 + sec;
}

/** Digits of the incline or speed readout: always one decimal ("20" → 2.0, "105" → 10.5). */
export function parseOneDecimal(text: string): number | undefined {
  const d = digitsOnly(text);
  if (/\?/.test(text) || !d.length) return undefined;
  return Number(d) / 10;
}

/** Read the four values from a photo of the console. Every value is for the pupil to check before sending. */
export function readTreadmill(img: Pixels): TreadmillReading {
  const { readouts: found, digitHeight: H } = findReadouts(img);
  const readouts = assignRoles(found);
  const warnings: string[] = [];
  const by = (role: ReadoutRole) => readouts.find((r) => r.role === role);
  const reading: TreadmillReading = { readouts, warnings };
  const d = by('distance');
  const t = by('time');
  const inc = by('incline');
  const sp = by('speed');
  if (d) reading.distanceKm = parseDistance(d.text);
  if (t) reading.timeSec = parseConsoleTime(t.text);
  if (inc) reading.inclinePct = parseOneDecimal(inc.text);
  if (sp) reading.speedKmh = parseOneDecimal(sp.text);
  if (!readouts.length) warnings.push('No lit display found. Take the photo straight on, close enough that the numbers fill most of the picture.');
  else {
    if (reading.distanceKm == null) warnings.push('Could not read the distance.');
    if (reading.timeSec == null) warnings.push('Could not read the time.');
    for (const r of readouts) if (r.confidence < 0.35) warnings.push(`Check "${r.text}"${r.role ? ` (${r.role})` : ''}: the photo was hard to read there.`);
  }
  if (readouts.length) {
    const box = {
      x: Math.min(...readouts.map((r) => r.box.x)),
      y: Math.min(...readouts.map((r) => r.box.y)),
      x1: Math.max(...readouts.map((r) => r.box.x + r.box.w)),
      y1: Math.max(...readouts.map((r) => r.box.y + r.box.h)),
    };
    const m = Math.round(H * 1.2);
    const x = Math.max(0, box.x - m);
    const y = Math.max(0, box.y - m);
    reading.displayBox = { x, y, w: Math.min(img.width, box.x1 + m) - x, h: Math.min(img.height, box.y1 + m) - y };
  }
  return reading;
}
