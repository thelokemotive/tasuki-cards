import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { assignRoles, decodeSegments, parseConsoleTime, parseDistance, parseOneDecimal, readTreadmill, type Pixels, type Readout } from './read';

// A real photo of the school's treadmill console (Nov 2026), 800 × 450, 4 bits per channel.
function photo(): Pixels {
  const data = gunzipSync(readFileSync(new URL('./fixtures/treadmill-photo-800x450.rgb.gz', import.meta.url)));
  return { width: 800, height: 450, data: new Uint8Array(data), channels: 3 };
}

// ---------------------------------------------------------------------------------------------------
// Drawn consoles: four readouts of italic seven-segment digits, like the real one.

const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abcf', '8': 'abcdefg', '9': 'abcdfg',
};

interface DrawOpts {
  /** Digit height in pixels. */
  h?: number;
  /** Italic lean in degrees. */
  slant?: number;
  /** Gap between segments as a fraction of the height (0 = joined, as in a blurred photo). */
  gap?: number;
  colour?: [number, number, number];
  /** Box blur radius. */
  blur?: number;
}

function drawConsole(texts: [string, string, string, string], o: DrawOpts = {}): Pixels {
  const h = o.h ?? 60;
  const w = Math.round(h * 0.55);
  const t = Math.max(2, Math.round(h * 0.1));
  const gap = Math.round((o.gap ?? 0) * h);
  const lean = Math.tan(((o.slant ?? 8) * Math.PI) / 180);
  const colour = o.colour ?? [190, 255, 60];
  const W = Math.round(h * 14);
  const Hh = Math.round(h * 6);
  const data = new Uint8Array(W * Hh * 3);
  for (let i = 0; i < W * Hh; i++) data.set([28, 30, 32], i * 3); // dark panel
  const put = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || xi >= W || yi < 0 || yi >= Hh) return;
    data.set(colour, (yi * W + xi) * 3);
  };
  // Fill a rectangle in upright digit space, then lean it about the digit's baseline.
  const rect = (ox: number, oy: number, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) put(ox + x + lean * (h - y), oy + y);
  };
  const digit = (ox: number, oy: number, d: string) => {
    const on = SEGS[d];
    const half = Math.round(h / 2);
    if (on.includes('a')) rect(ox, oy, t + gap, 0, w - t - gap, t);
    if (on.includes('g')) rect(ox, oy, t + gap, half - t / 2, w - t - gap, half + t / 2);
    if (on.includes('d')) rect(ox, oy, t + gap, h - t, w - t - gap, h);
    if (on.includes('f')) rect(ox, oy, 0, gap, t, half - gap);
    if (on.includes('b')) rect(ox, oy, w - t, gap, w, half - gap);
    if (on.includes('e')) rect(ox, oy, 0, half + gap, t, h - gap);
    if (on.includes('c')) rect(ox, oy, w - t, half + gap, w, h - gap);
  };
  const dot = (ox: number, oy: number) => rect(ox, oy, 0, h - t, t, h);
  const readout = (ox: number, oy: number, text: string) => {
    let x = ox;
    for (const ch of text) {
      if (ch === '.') {
        dot(x - Math.round(w * 0.12), oy);
        x += Math.round(w * 0.25);
      } else if (ch === ':') {
        rect(x, oy, 0, Math.round(h * 0.25), t, Math.round(h * 0.25) + t);
        rect(x, oy, 0, Math.round(h * 0.7), t, Math.round(h * 0.7) + t);
        x += Math.round(w * 0.5);
      } else {
        digit(x, oy, ch);
        x += Math.round(w * 1.3);
      }
    }
  };
  readout(Math.round(h * 1.5), Math.round(h * 1.2), texts[0]);
  readout(Math.round(h * 8.5), Math.round(h * 1.2), texts[1]);
  readout(Math.round(h * 2), Math.round(h * 3.8), texts[2]);
  readout(Math.round(h * 9), Math.round(h * 3.8), texts[3]);
  let img: Pixels = { width: W, height: Hh, data, channels: 3 };
  if (o.blur) img = boxBlur(img, o.blur);
  return img;
}

function boxBlur(img: Pixels, r: number): Pixels {
  const { width: W, height: H, data } = img;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            s += data[(yy * W + xx) * 3 + c];
            n++;
          }
        }
        out[(y * W + x) * 3 + c] = Math.round(s / n);
      }
    }
  }
  return { width: W, height: H, data: out, channels: 3 };
}

describe('reading the real console photo', () => {
  it('reads distance 0.024 km, time 0:37, incline 2.0 %, speed 2.7 km/h', () => {
    const r = readTreadmill(photo());
    expect(r.distanceKm).toBe(0.024);
    expect(r.timeSec).toBe(37);
    expect(r.inclinePct).toBe(2);
    expect(r.speedKmh).toBe(2.7);
    expect(r.readouts.map((x) => x.role)).toEqual(['distance', 'time', 'incline', 'speed']);
    expect(r.readouts.find((x) => x.role === 'time')?.text).toBe('0:37');
    expect(r.warnings).toEqual([]);
  });

  it('keeps the display, not the room: the evidence crop sits inside the photo around the numbers', () => {
    const r = readTreadmill(photo());
    const b = r.displayBox!;
    expect(b.x).toBeGreaterThan(100);
    expect(b.y).toBeGreaterThan(50);
    expect(b.x + b.w).toBeLessThan(700);
    expect(b.y + b.h).toBeLessThan(400);
  });

  it('works from an RGBA canvas buffer too', () => {
    const p = photo();
    const rgba = new Uint8ClampedArray(p.width * p.height * 4);
    for (let i = 0; i < p.width * p.height; i++) rgba.set([p.data[i * 3], p.data[i * 3 + 1], p.data[i * 3 + 2], 255], i * 4);
    const r = readTreadmill({ width: p.width, height: p.height, data: rgba });
    expect([r.distanceKm, r.timeSec, r.inclinePct, r.speedKmh]).toEqual([0.024, 37, 2, 2.7]);
  });

  it('says so when there is no lit display in the photo', () => {
    const blank: Pixels = { width: 200, height: 100, data: new Uint8Array(200 * 100 * 3).fill(120), channels: 3 };
    const r = readTreadmill(blank);
    expect(r.readouts).toEqual([]);
    expect(r.warnings[0]).toMatch(/No lit display/);
  });
});

describe('reading drawn consoles (every digit, sharp and blurred)', () => {
  const cases: { texts: [string, string, string, string]; want: [number, number, number, number]; opts?: DrawOpts; label: string }[] = [
    { label: 'all digits 0–4', texts: ['1.234', '40:12', '0.0', '10.4'], want: [1.234, 2412, 0, 10.4] },
    { label: 'all digits 5–9', texts: ['5.678', '59:59', '9.5', '16.8'], want: [5.678, 3599, 9.5, 16.8] },
    { label: 'separate segments (a sharp photo)', texts: ['3.096', '21:47', '1.5', '12.0'], want: [3.096, 1307, 1.5, 12], opts: { gap: 0.03 } },
    { label: 'blurred', texts: ['8.025', '36:18', '4.0', '13.3'], want: [8.025, 2178, 4, 13.3], opts: { blur: 2 } },
    { label: 'upright digits, red LEDs', texts: ['2.718', '14:06', '3.5', '11.7'], want: [2.718, 846, 3.5, 11.7], opts: { slant: 0, colour: [255, 40, 30] } },
    { label: 'small in the frame', texts: ['5.000', '25:30', '1.0', '11.8'], want: [5, 1530, 1, 11.8], opts: { h: 26 } },
  ];
  for (const c of cases) {
    it(c.label, () => {
      const r = readTreadmill(drawConsole(c.texts, c.opts));
      expect([r.distanceKm, r.timeSec, r.inclinePct, r.speedKmh]).toEqual(c.want);
    });
  }
});

describe('turning readouts into values', () => {
  it('distance always has three decimals', () => {
    expect(parseDistance('0024')).toBe(0.024);
    expect(parseDistance('5000')).toBe(5);
    expect(parseDistance('12345')).toBe(12.345);
    expect(parseDistance('0.024')).toBe(0.024);
    expect(parseDistance('?24')).toBeUndefined();
  });
  it('time is min:sec, with hours in front when shown', () => {
    expect(parseConsoleTime('0:37')).toBe(37);
    expect(parseConsoleTime('037')).toBe(37);
    expect(parseConsoleTime('25:30')).toBe(1530);
    expect(parseConsoleTime('1:02:33')).toBe(3753);
    expect(parseConsoleTime('10233')).toBe(3753);
    expect(parseConsoleTime('2:75')).toBeUndefined();
  });
  it('incline and speed always have one decimal', () => {
    expect(parseOneDecimal('20')).toBe(2);
    expect(parseOneDecimal('105')).toBe(10.5);
    expect(parseOneDecimal('00')).toBe(0);
  });
  it('a colon names the time readout wherever it sits', () => {
    const r = (text: string, x: number, y: number): Readout => ({ text, box: { x, y, w: 50, h: 20 }, confidence: 1 });
    const roles = assignRoles([r('0024', 0, 0), r('20', 100, 0), r('0:37', 0, 100), r('27', 100, 100)]);
    expect(roles.find((x) => x.text === '0:37')?.role).toBe('time');
    expect(roles.find((x) => x.text === '20')?.role).toBe('incline');
  });
  it('rows are found even when the phone is tilted', () => {
    const r = (text: string, x: number, y: number): Readout => ({ text, box: { x, y, w: 80, h: 30 }, confidence: 1 });
    // Tilted about 12°: the right-hand readouts sit 60 px higher than the left-hand ones.
    const roles = assignRoles([r('A', 0, 100), r('B', 300, 40), r('C', 0, 220), r('D', 300, 160)]);
    expect(roles.map((x) => `${x.text}:${x.role}`)).toEqual(['A:distance', 'B:time', 'C:incline', 'D:speed']);
  });
  it('segment patterns: a clean 8 is confident, an ambiguous mark is not', () => {
    expect(decodeSegments([1, 1, 1, 1, 1, 1, 1])).toEqual({ digit: '8', confidence: 1 });
    expect(decodeSegments([1, 1, 1, 0.5, 0, 0.5, 1]).confidence).toBeLessThan(0.35);
  });
});
