// Display formatting shared by engine and UI.

const MINUS = '−';

/** 975 → '16:15'; 3753 → '1:02:33'. Rounds to whole seconds. */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const s = Math.round(Math.abs(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
  return sec < 0 ? MINUS + body : body;
}

/** 195 → '3:15/km' */
export function formatPace(secPerKm: number): string {
  return `${formatTime(secPerKm)}/km`;
}

/** Signed time difference: −12 → '−12 s'; −65 → '−1:05'; 5 → '+5 s'; 0 → '±0 s'. */
export function formatDelta(sec: number): string {
  const s = Math.round(sec);
  if (s === 0) return '±0 s';
  const sign = s < 0 ? MINUS : '+';
  const a = Math.abs(s);
  return a < 60 ? `${sign}${a} s` : `${sign}${formatTime(a)}`;
}

/** 4 → '4 km'; 1.3 → '1.3 km'; 21.0975 → '21.1 km'; 0.8 → '800 m'. */
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  const r = Math.round(km * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)} km`;
}
