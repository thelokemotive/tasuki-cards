// "Defensible, not a black box" (go-live plan 4): a plain-English account of every rating, generated from
// the same derived data the card shows. Pure: it reads the athlete's derived ratings and their
// performances and never recalculates a rating differently — the numbers it quotes are recomputed with the
// same engine functions, and the result it names is the stat's own basis.
import type { Performance, Sex } from '../types';
import type { Config } from './config';
import type { AthleteDerived } from './derive';
import type { PerfScore, RatingKey, StatKey, StatValue } from './types';
import { ARM_DOMAINS, armLevelsFromTest } from './arm';
import { formatLongDate, formatShortDate } from './dates';
import { displayName } from './display';
import { formatPace, formatTime } from './format';
import { resolveContext, type Lookup, type PerfContext } from './perf';
import { bleepPercentile, bleepRow, fixedAgeAdjustment, perfFeeds, UNSCORED } from './scoring';
import { navReferencePace } from './stats';
import { BLEEP_PERCENTILES } from './config';

export type Audience = 'coach' | 'student';

export interface ExplainOptions {
  /** 'student': display name only, ages in whole years, nothing coach-only (no DOB is ever used). */
  audience?: Audience;
}

/** How one result was treated for this stat. */
export type ConsideredStatus = 'used' | 'shield' | 'lower' | 'older' | 'expired' | 'unverified' | 'not_scored' | 'not_top3' | 'outside_window' | 'future';

export interface ConsideredResult {
  perfId: string;
  date: string;
  /** 'Hachimantai 3K · 16:40' */
  label: string;
  score?: number;
  fresh?: number;
  status: ConsideredStatus;
  /** Plain-English reason: 'used', 'lower (72 against 84)', 'older: 86 before freshness, 80 after', … */
  reason: string;
}

export interface StatExplanation {
  key: RatingKey;
  /** 'SPD 84' or 'SPD: locked' */
  headline: string;
  /** The working, in order: where the number comes from, the calculation, freshness, Growth Shield. */
  paragraphs: string[];
  /** Every result that was meant for this stat, best first. */
  considered: ConsideredResult[];
}

const STAT_LONG: Record<RatingKey, string> = { RACE: 'RACE', SPD: 'SPD (speed)', END: 'END (endurance)', CLB: 'CLB (climbing)', DSC: 'DSC (descending)', NAV: 'NAV (navigation)', ARM: 'ARM (armour)' };
const KIND_WORD: Record<string, string> = { race: 'race', relay_leg: 'relay leg', parkrun: 'parkrun', long_run: 'long run', circuit: 'Circuit run', climb: 'climb', descent: 'descent', nav: 'nav course', bleep: 'bleep test', arm: 'ARM test' };

const km = (x: number) => `${Number(x.toFixed(2))} km`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num1 = (x: number) => String(Number(x.toFixed(1)));

interface Who {
  name: string;
  ageText: (age: number) => string;
  person: (age: number) => string;
  /** 'a 13.6-year-old girl', 'an 11-year-old boy', 'an 18-year-old man' */
  aPerson: (age: number) => string;
}

function who(d: AthleteDerived, audience: Audience): Who {
  const a = d.athlete;
  const name = audience === 'student' ? displayName(a) : (a.preferredName || a.givenName || 'The athlete').trim();
  const ageText = (age: number) => (audience === 'student' ? String(Math.floor(age + 1e-9)) : num1(age));
  const person = (age: number) => `${ageText(age)}-year-old ${noun(a.sex, age)}`;
  const aPerson = (age: number) => `${/^(8|11|18)(\D|$)|^8\d/.test(ageText(age)) ? 'an' : 'a'} ${person(age)}`;
  return { name, ageText, person, aPerson };
}

function noun(sex: Sex, age: number): string {
  if (age < 18) return sex === 'F' ? 'girl' : 'boy';
  return sex === 'F' ? 'woman' : 'man';
}

function placeOf(ctx: PerfContext): string {
  const k = ctx.perf.kind;
  if (k === 'race' || k === 'relay_leg' || k === 'parkrun' || k === 'long_run') return ctx.event?.name ?? ctx.course?.name ?? KIND_WORD[k];
  if (k === 'bleep') return 'the bleep test';
  if (k === 'arm') return 'the ARM test';
  return ctx.course?.name ?? ctx.event?.name ?? KIND_WORD[k] ?? k;
}

function resultText(p: Performance): string {
  if (p.kind === 'bleep') return p.bleepLaps != null ? `${p.bleepLaps} laps` : '';
  if (p.kind === 'arm') {
    const a = p.arm ?? {};
    return [a.ankleCm != null && `ankle ${a.ankleCm} cm`, a.calfReps != null && `calf ${a.calfReps}`, a.storkSec != null && `stork ${a.storkSec} s`].filter(Boolean).join(', ');
  }
  return p.timeSec != null ? formatTime(p.timeSec) : '';
}

function labelOf(ctx: PerfContext): string {
  const r = resultText(ctx.perf);
  return `${placeOf(ctx)}${r ? ` · ${r}` : ''}`;
}

/** "3 km + 40 m climb = 3.4 km effort" (with the terrain factor when it is not 1). */
function effortText(ctx: PerfContext, dEff: number): string {
  if (ctx.distanceKm == null) return `${km(dEff)} effort`;
  const climb = ctx.climbM ? ` + ${Math.round(ctx.climbM)} m climb` : ' with no climb';
  const terrain = ctx.terrainFactor !== 1 ? `, × terrain factor ${ctx.terrainFactor.toFixed(2)}` : '';
  return `${km(ctx.distanceKm)}${climb}${terrain} = ${km(dEff)} effort`;
}

function freshnessText(ps: PerfScore, config: Config): string {
  const f = config.freshness;
  const months = `${ps.monthsOld} month${ps.monthsOld === 1 ? '' : 's'} old`;
  if (ps.score == null || ps.fresh == null) return '';
  if (ps.penalty === 0) return `The result is ${months}, so there is no freshness penalty (results count in full for ${f.decayGraceMonths} months).`;
  return `The result is ${months}: ${ps.penalty} point${ps.penalty === 1 ? '' : 's'} off for freshness (${f.decayPointsPerMonth} a month after the first ${f.decayGraceMonths} months), so ${ps.score} becomes ${ps.fresh}.`;
}

/** The calculation for one scored performance, in one or two sentences. */
function scoreWorking(ctx: PerfContext, ps: PerfScore, d: AthleteDerived, w: Who, config: Config, lookup: Lookup): string {
  const p = ctx.perf;
  const { max, anchorAG } = config.runScore;
  if (ps.score == null) return '';
  if (p.kind === 'bleep' && p.bleepLaps != null) {
    const row = bleepRow(d.athlete.sex, ps.age, config);
    const l95 = row[row.length - 1];
    const e = config.end;
    const who = w.aPerson(ps.age);
    if (p.bleepLaps > l95) {
      return `${p.bleepLaps} laps is above the 95th percentile for ${who} (${l95} laps), so the rating rises from ${e.bleepCapAtP95} at ${l95} laps to ${e.bleepTopScore} at ${Math.round(l95 * e.bleepTopMultiplier)} laps: ${ps.score}.`;
    }
    const pc = bleepPercentile(p.bleepLaps, d.athlete.sex, ps.age, config);
    const i = row.findIndex((l) => p.bleepLaps! < l);
    const between = i > 0 ? ` (between P${BLEEP_PERCENTILES[i - 1]} = ${row[i - 1]} and P${BLEEP_PERCENTILES[i]} = ${row[i]} laps)` : i === 0 ? ` (below P${BLEEP_PERCENTILES[0]} = ${row[0]} laps)` : '';
    return `For ${who}, ${p.bleepLaps} laps is the ${num1(pc)}th percentile${between}. Rating = ${e.bleepBase} + ${e.bleepSlope} × ${num1(pc)} = ${num1(e.bleepBase + e.bleepSlope * pc)} → ${ps.score}.`;
  }
  if (p.kind === 'nav') {
    const ref = navReferencePace(d.perfs, lookup, config, d.athlete, d.ratings.asOf);
    const route = ps.dEff ?? p.routeKmEff ?? ctx.dEff;
    if (!ref || route == null || p.timeSec == null) return '';
    const refPerf = d.perfs.find((x) => x.id === ref.perfId);
    const refCtx = refPerf ? resolveContext(refPerf, lookup) : undefined;
    const from = refCtx ? `${placeOf(refCtx)}, ${formatShortDate(refCtx.perf.date)}` : 'an earlier run';
    const refText = `${formatPace(ref.secPerKm)} (best ${ref.source === 'circuit' ? 'Circuit' : 'short-race'} pace, from ${from})`;
    const errors = p.navErrors ?? 0;
    if (errors >= config.nav.maxErrors) return `${errors} control errors is the maximum (${config.nav.maxErrors}), so NAV scores ${config.runScore.min}.`;
    const predicted = route * ref.secPerKm * config.nav.allowance;
    const charged = p.timeSec + config.nav.penaltySecPerError * errors;
    const eff = predicted / charged;
    const e0 = config.nav.effAtMin;
    return `Reference pace ${refText}. Predicted time = ${km(route)} × ${formatPace(ref.secPerKm)} × ${config.nav.allowance} allowance = ${formatTime(predicted)}. ${w.name} took ${formatTime(p.timeSec)}${errors ? ` + ${errors} error${errors === 1 ? '' : 's'} × ${config.nav.penaltySecPerError} s = ${formatTime(charged)}` : ' with no errors'}. Efficiency = ${formatTime(predicted)} ÷ ${formatTime(charged)} = ${pct(eff)}. NAV = ${config.runScore.min} + ${config.runScore.max - config.runScore.min} × (${num1(eff * 100) + '%'} − ${e0 * 100}%) ÷ ${100 - e0 * 100}% → ${ps.score}.`;
  }
  if (p.timeSec == null) return '';
  const mode = ctx.course?.benchmarkMode ?? (p.kind === 'descent' ? 'fixed' : 'age_grade');
  if (mode === 'fixed' && ctx.course) {
    const t99 = d.athlete.sex === 'M' ? ctx.course.t99OpenM : ctx.course.t99OpenF;
    if (t99 == null) return '';
    const adj = fixedAgeAdjustment(ps.age, d.athlete.sex, config);
    const own = t99 * adj;
    const ref = ctx.course.notes && /benchmark/i.test(ctx.course.notes) ? ` (${ctx.course.notes})` : '';
    return `${ctx.course.name} is scored against a fixed benchmark${ref}: the 99-point time for open ${d.athlete.sex === 'F' ? 'women' : 'men'} is ${formatTime(t99)}. For ${w.aPerson(ps.age)} the age adjustment is × ${adj.toFixed(3)}, so the 99-point time is ${formatTime(own)}. ${w.name} ran ${formatTime(p.timeSec)}: ${max} × ${formatTime(own)} ÷ ${formatTime(p.timeSec)} = ${num1((max * own) / p.timeSec)} → ${ps.score}.`;
  }
  if (ps.standardSec == null || ps.ageGrade == null || ps.dEff == null) return '';
  return `${effortText(ctx, ps.dEff)}. The world-standard time for ${w.aPerson(ps.age)} at ${km(ps.dEff)} is ${formatTime(ps.standardSec)}. ${w.name} ran ${formatTime(p.timeSec)}, an age grade of ${pct(ps.ageGrade)}. Run Score = ${max} × ${pct(ps.ageGrade)} ÷ ${pct(anchorAG).replace('.0%', '%')} = ${num1((max * ps.ageGrade) / anchorAG)} → ${ps.score}${(max * ps.ageGrade) / anchorAG > max ? ` (capped at ${max})` : ''}.`;
}

interface Item {
  perf: Performance;
  ctx: PerfContext;
  ps: PerfScore;
}

/** Results meant for this stat (scored for it, or would be if verified, clean, …), deleted ones left out. */
function intendedFor(key: RatingKey, d: AthleteDerived, config: Config, lookup: Lookup): Item[] {
  const byId = new Map(d.ratings.perfScores.map((s) => [s.perfId, s]));
  return d.perfs
    .filter((p) => !p.deleted)
    .flatMap((perf) => {
      const ps = byId.get(perf.id);
      if (!ps) return [];
      const ctx = resolveContext(perf, lookup);
      return ps.feeds.includes(key) || perfFeeds(ctx, config).includes(key) ? [{ perf, ctx, ps }] : [];
    });
}

function rank(a: Item, b: Item): number {
  return (b.ps.fresh ?? -1) - (a.ps.fresh ?? -1) || (b.ps.score ?? -1) - (a.ps.score ?? -1) || (a.perf.date < b.perf.date ? 1 : a.perf.date > b.perf.date ? -1 : 0);
}

function considered(key: RatingKey, items: Item[], stat: StatValue, config: Config): ConsideredResult[] {
  const used = new Set(stat.basis?.perfIds ?? []);
  const shieldId = stat.shielded ? stat.basis?.perfIds[0] : undefined;
  const best = items.find((i) => used.has(i.perf.id) && i.perf.id !== shieldId) ?? items.find((i) => used.has(i.perf.id));
  const out = [...items].sort(rank).map((i): ConsideredResult => {
    const base = { perfId: i.perf.id, date: i.perf.date, label: labelOf(i.ctx), score: i.ps.score, fresh: i.ps.fresh };
    const ps = i.ps;
    if (i.perf.id === shieldId) return { ...base, status: 'shield', reason: `Growth Shield: best in the last ${config.growthShield.windowMonths} months` };
    if (used.has(i.perf.id)) return { ...base, status: 'used', reason: key === 'RACE' ? 'one of the top three' : key === 'ARM' ? 'sets a best level' : 'used' };
    if (ps.unscoredReason === UNSCORED.unverified) return { ...base, status: 'unverified', reason: 'waiting to be verified' };
    if (ps.unscoredReason === UNSCORED.future) return { ...base, status: 'future', reason: 'after the as-of date' };
    if (ps.unscoredReason) return { ...base, status: 'not_scored', reason: ps.unscoredReason };
    if (ps.expired || ps.fresh == null) return { ...base, status: 'expired', reason: `over ${config.freshness.expireMonths} months old` };
    if (key === 'ARM') return { ...base, status: 'outside_window', reason: ps.monthsOld >= config.arm.windowMonths ? `outside the ${config.arm.windowMonths}-month window` : 'no better level than the tests used' };
    if (key === 'RACE') return { ...base, status: 'not_top3', reason: `not in the top three (${ps.fresh})` };
    const bf = best?.ps.fresh;
    if (bf != null && ps.score != null && ps.score >= (best?.ps.score ?? 0) && ps.fresh < bf) {
      return { ...base, status: 'older', reason: `older: ${ps.score} before freshness, ${ps.fresh} after` };
    }
    if (bf != null && ps.fresh === bf) return { ...base, status: 'lower', reason: `equal (${ps.fresh}): the more recent result wins` };
    return { ...base, status: 'lower', reason: bf != null ? `lower (${ps.fresh} against ${bf})` : `lower (${ps.fresh})` };
  });
  return out;
}

function pathwayText(key: StatKey, config: Config): string {
  switch (key) {
    case 'SPD':
      return config.spd.allowRaces ? `SPD is the best of the Circuit and any verified race, relay leg or parkrun of up to ${config.spd.raceMaxKmEff} km effort.` : 'SPD is the best Circuit score.';
    case 'END':
      return `END is the better of the bleep test and the best verified race, relay leg, parkrun or long run of ${config.end.longRunMinKmEff} km effort or more.`;
    case 'CLB':
      return config.clb.allowRaces ? `CLB is the best climb-course score, or any verified race or long run with at least ${config.clb.raceMinClimbM} m of climb and ${config.clb.raceMinClimbPerKm} m per km.` : 'CLB is the best climb-course score.';
    case 'DSC':
      return 'DSC is the best clean run on a descent course, scored against the course benchmark.';
    case 'NAV':
      return 'NAV compares the time on a nav course with a prediction from the runner’s own pace.';
    case 'ARM':
      return `ARM uses the best level in each of ankle, calf and balance from tests in the last ${config.arm.windowMonths} months, so it never falls on a bad retest.`;
  }
}

function armWorking(d: AthleteDerived, items: Item[], stat: StatValue, config: Config, w: Who): string[] {
  const used = new Set(stat.basis?.perfIds ?? []);
  const levels = d.ratings.arm;
  const parts: string[] = [];
  for (const dom of ARM_DOMAINS) {
    const lvl = levels[dom];
    if (lvl == null) {
      parts.push(`${dom}: not tested`);
      continue;
    }
    const src = items.find((i) => used.has(i.perf.id) && armLevelsFromTest(i.perf.arm, config)[dom] === lvl);
    const m = src?.perf.arm;
    const measure = dom === 'ankle' ? m?.ankleCm != null && `${m.ankleCm} cm` : dom === 'calf' ? m?.calfReps != null && `${m.calfReps} heel raises` : m?.storkSec != null && `${m.storkSec} s${lvl === 5 ? ' + hop-and-stick' : ''}`;
    parts.push(`${dom} level ${lvl}${measure ? ` (${measure}${src ? `, ${formatShortDate(src.perf.date)}` : ''})` : ''}`);
  }
  const out = [`${w.name}'s best levels: ${parts.join('; ')}.`];
  if (!stat.locked && levels.ankle != null && levels.calf != null && levels.balance != null) {
    const sum = levels.ankle + levels.calf + levels.balance;
    const { min, max } = config.runScore;
    out.push(`ARM = ${min} + (${sum} − 3) × ${max - min} ÷ 12 = ${num1(min + ((sum - 3) * (max - min)) / 12)} → ${stat.current}. ARM has no freshness penalty: the ${config.arm.windowMonths}-month window replaces it.`);
  }
  return out;
}

/** The explanation of one rating (RACE or one of the six stats). */
export function explainStat(d: AthleteDerived, key: RatingKey, config: Config, lookup: Lookup, opts: ExplainOptions = {}): StatExplanation {
  const audience = opts.audience ?? 'coach';
  const w = who(d, audience);
  const r = d.ratings;
  const stat: StatValue = key === 'RACE' ? r.race : r.stats[key];
  const items = intendedFor(key, d, config, lookup);
  const list = considered(key, items, stat, config);
  const paragraphs: string[] = [];
  if (key !== 'RACE') paragraphs.push(pathwayText(key, config));

  if (stat.locked) {
    paragraphs.push(`${key} is locked: ${stat.unlockHelp ?? stat.unlockHint ?? ''}`.trim());
    if (key === 'ARM') paragraphs.push(...armWorking(d, items, stat, config, w).slice(0, 1));
    return { key, headline: `${key}: locked`, paragraphs, considered: list };
  }

  if (key === 'ARM') {
    paragraphs.push(...armWorking(d, items, stat, config, w));
  } else if (key === 'RACE') {
    const used = (stat.basis?.perfIds ?? []).map((id) => items.find((i) => i.perf.id === id)).filter((x): x is Item => !!x);
    const weights = used.length === 3 ? config.race.weights3 : used.length === 2 ? config.race.weights2 : [1];
    paragraphs.push(`RACE blends the best ${used.length === 1 ? 'race' : `${used.length} races`} (verified races, relay legs and parkruns, after freshness)${used.length > 1 ? `, weighted ${weights.map((x) => `${Math.round(x * 100)}%`).join(' / ')}` : ''}. Racing more earns caps, never points.`);
    const sum = used.reduce((s, i, k) => s + (weights[k] ?? 0) * (i.ps.fresh ?? 0), 0);
    if (used.length > 1) paragraphs.push(`RACE = ${used.map((i, k) => `${Math.round((weights[k] ?? 0) * 100)}% × ${i.ps.fresh} (${placeOf(i.ctx)}, ${formatShortDate(i.perf.date)})`).join(' + ')} = ${num1(sum)} → ${stat.value}.`);
    for (const i of used) {
      const wk = scoreWorking(i.ctx, i.ps, d, w, config, lookup);
      if (wk) paragraphs.push(`${placeOf(i.ctx)} (${formatLongDate(i.perf.date)}): ${wk} ${freshnessText(i.ps, config)}`.trim());
    }
  } else {
    const shieldId = stat.shielded ? stat.basis?.perfIds[0] : undefined;
    const bestId = stat.shielded ? stat.basis?.perfIds.find((id) => id !== shieldId) ?? shieldId : stat.basis?.perfIds[0];
    // With the shield on, the current value comes from the best fresh result, not from the peak.
    const best = stat.shielded ? [...items].filter((i) => i.ps.fresh != null && i.ps.feeds.includes(key)).sort(rank)[0] : items.find((i) => i.perf.id === bestId);
    if (best) {
      paragraphs.push(`${key} ${stat.current} comes from ${placeOf(best.ctx)} on ${formatLongDate(best.perf.date)}.`);
      const wk = scoreWorking(best.ctx, best.ps, d, w, config, lookup);
      if (wk) paragraphs.push(wk);
      const fr = freshnessText(best.ps, config);
      if (fr) paragraphs.push(fr);
    }
  }

  if (stat.shielded && stat.peak12m != null) {
    const peak = items.find((i) => i.perf.id === stat.basis?.perfIds[0]);
    paragraphs.push(
      `Growth Shield: ${w.name}'s streak is active, so ${key} shows no less than ${config.growthShield.margin} below the best of the last ${config.growthShield.windowMonths} months: ${stat.peak12m}${peak ? ` (${placeOf(peak.ctx)}, ${formatShortDate(peak.perf.date)})` : ''} − ${config.growthShield.margin} = ${stat.value}, instead of ${stat.current}.`,
    );
  }
  if (key !== 'RACE' && key !== 'ARM' && list.length > 1) {
    const others = list.filter((c) => c.status !== 'used' && c.status !== 'shield').length;
    if (others) paragraphs.push(`${others} other result${others === 1 ? ' was' : 's were'} considered; the list below says why ${others === 1 ? 'it' : 'they'} did not win.`);
  }
  return { key, headline: `${key} ${stat.value}`, paragraphs, considered: list };
}

/** OVR and tier in words. */
export function explainOvr(d: AthleteDerived, config: Config): string[] {
  const r = d.ratings;
  const STATS: StatKey[] = ['SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'];
  const unlocked = STATS.filter((k) => !r.stats[k].locked);
  const out: string[] = [];
  if (r.ovr.value == null) out.push(`OVR needs at least ${config.ovr.minUnlocked} unlocked stats (${unlocked.length} so far).`);
  else out.push(`OVR = the average of the ${unlocked.length} unlocked stats: (${unlocked.map((k) => r.stats[k].value).join(' + ')}) ÷ ${unlocked.length} = ${num1(unlocked.reduce((s, k) => s + (r.stats[k].value ?? 0), 0) / unlocked.length)} → ${r.ovr.value}. Locked stats do not count against it.`);
  out.push(`Tier: ${r.tier[0].toUpperCase()}${r.tier.slice(1)}${r.tierNote ? ` (${r.tierNote})` : ''}. ★ ${r.race.caps} race cap${r.race.caps === 1 ? '' : 's'}.`);
  return out;
}

/** Every rating explained, for the student-readable sheet. */
export function explainAll(d: AthleteDerived, config: Config, lookup: Lookup, opts: ExplainOptions = {}): StatExplanation[] {
  const keys: RatingKey[] = ['RACE', 'SPD', 'END', 'CLB', 'DSC', 'NAV', 'ARM'];
  return keys.map((k) => explainStat(d, k, config, lookup, opts));
}

/** Plain text of an explanation (for copying into a message or report). */
export function explanationText(e: StatExplanation, withList = true): string {
  const lines = [`${STAT_LONG[e.key]}: ${e.headline.replace(`${e.key} `, '').replace(`${e.key}: `, '')}`, ...e.paragraphs];
  if (withList && e.considered.length) lines.push(...e.considered.map((c) => `  · ${formatShortDate(c.date)} ${c.label}${c.fresh != null ? ` (${c.fresh})` : ''}: ${c.reason}`));
  return lines.join('\n');
}

/** Pace over the raw distance (s/km), for the results table. */
export function paceOf(p: Performance, ctx: PerfContext): number | undefined {
  return p.timeSec != null && ctx.distanceKm != null && ctx.distanceKm > 0 ? p.timeSec / ctx.distanceKm : undefined;
}
