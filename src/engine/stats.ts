// Athlete ratings (spec 3.8–3.10): the six stats, RACE, OVR and tier, built from scored performances.
// Each stat is a number or locked with a how-to-unlock; a number is never manufactured.
import type { Athlete, ISODate, Performance } from '../types';
import type { Config } from './config';
import type { ArmLevels, AthleteRatings, OvrValue, PerfScore, RaceStat, RatingKey, StatBasis, StatKey, StatValue, Tier } from './types';
import { STAT_KEYS } from './types';
import { ageOnDate } from './age';
import { ARM_DOMAINS, armLevelsFromTest, type ArmDomain } from './arm';
import { formatLongDate, formatShortDate, isISODate, monthsBetween } from './dates';
import { formatKm, formatTime } from './format';
import { byDate, counts, raceCaps, resolveContext, type Lookup, type PerfContext } from './perf';
import { armScoreClamped, perfFeeds, roundScore, scorePerformance, UNSCORED } from './scoring';

export interface StatsInput {
  athlete: Athlete;
  /** The athlete's performances (others are ignored), including deleted and unverified ones. */
  perfs: Performance[];
  lookup: Lookup;
  config: Config;
  asOf: ISODate;
  /** Streak status is 'active' or 'frozen' (enables the Growth Shield). */
  streakActiveOrFrozen: boolean;
}

interface Entry {
  perf: Performance;
  ctx: PerfContext;
  ps: PerfScore;
}

interface Lock {
  hint: string;
  help: string;
}

const KIND_LABEL: Record<string, string> = { race: 'Race', relay_leg: 'Relay leg', parkrun: 'parkrun', long_run: 'Long run' };
const DEFAULT_PLACE: Record<StatKey, string> = { SPD: 'the Circuit', END: 'run', CLB: 'climb', DSC: 'descent', NAV: 'nav course', ARM: 'ARM test' };

/** Best first: highest FreshScore, then highest unpenalised score, then most recent. */
function byFreshDesc(a: Entry, b: Entry): number {
  const d = (b.ps.fresh ?? -1) - (a.ps.fresh ?? -1) || (b.ps.score ?? -1) - (a.ps.score ?? -1);
  if (d !== 0) return d;
  return -byDate(a.perf, b.perf);
}

/** Best first by unpenalised score (for the Growth Shield peak), then most recent. */
function byScoreDesc(a: Entry, b: Entry): number {
  return (b.ps.score ?? -1) - (a.ps.score ?? -1) || -byDate(a.perf, b.perf);
}

/** 'ankle', 'ankle and calf', 'ankle, calf and balance' */
function listWords(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function kmLabel(km: number): string {
  return String(Number(km.toFixed(1)));
}

function longRunKmLabel(config: Config): string {
  return kmLabel(config.end.longRunMinKmEff);
}

/** Default card hint (≤ 3 words) and coach-view help for a locked rating. */
function defaultLock(key: RatingKey, config: Config): Lock {
  switch (key) {
    case 'SPD':
      return config.spd.allowRaces
        ? { hint: `Circuit or ${kmLabel(config.spd.raceMaxKmEff)}K`, help: `Run the Circuit, or a verified race, relay leg or parkrun of up to ${kmLabel(config.spd.raceMaxKmEff)} km effort, to unlock SPD.` }
        : { hint: 'Run the Circuit', help: 'Run the Circuit (verified) to unlock SPD.' };
    case 'END':
      return config.end.allowLongRuns
        ? { hint: `Bleep or ${longRunKmLabel(config)}K+`, help: `Do a bleep test, or a verified race, relay leg, parkrun or long run of ${longRunKmLabel(config)} km effort or more, to unlock END.` }
        : { hint: 'Do a bleep test', help: 'Do a bleep test to unlock END.' };
    case 'CLB':
      return config.clb.allowRaces
        ? { hint: 'Race a hill', help: `Run a climb course, or a verified race or long run with at least ${config.clb.raceMinClimbM} m of climb and ${config.clb.raceMinClimbPerKm} m per km, to unlock CLB.` }
        : { hint: 'Run a climb', help: 'Run a climb course (verified) to unlock CLB.' };
    case 'DSC':
      return { hint: 'Clean descent run', help: 'Complete a clean run on a descent course (verified) to unlock DSC.' };
    case 'NAV':
      return { hint: 'Complete a nav', help: 'Complete a navigation course (verified) to unlock NAV.' };
    case 'ARM':
      return { hint: 'Test all three', help: `Test ankle, calf and balance to unlock ARM (tests from the last ${config.arm.windowMonths} months count).` };
    case 'RACE':
      return { hint: 'Race to unlock', help: 'Run a verified race, relay leg or parkrun (with a time and distance) to unlock RACE.' };
  }
}

/**
 * Why a rating is locked, most actionable first: a course benchmark not set; NAV without a reference
 * pace; descents that were not clean runs; results that have expired; results awaiting verification.
 */
function lockFor(key: RatingKey, entries: Entry[], config: Config, asOf: ISODate): Lock {
  const def = defaultLock(key, config);
  const intended = entries.filter((e) => e.perf.date <= asOf && !e.perf.deleted && perfFeeds(e.ctx, config).includes(key));
  const candidates = intended.filter((e) => counts(e.perf));
  const reasons = new Set(candidates.map((e) => e.ps.unscoredReason));
  if (reasons.has(UNSCORED.benchmark)) return { hint: 'Benchmark not set', help: UNSCORED.benchmark };
  if (reasons.has(UNSCORED.noAge)) {
    return { hint: 'Check athlete details', help: `Results cannot be scored until the athlete's age and sex are known: check the year group, date of birth and sex to unlock ${key}.` };
  }
  if (key === 'NAV' && reasons.has(UNSCORED.noRefPace)) {
    return { hint: 'Run any race', help: 'Run the Circuit or any verified race to set a reference pace, then NAV unlocks.' };
  }
  if (key === 'NAV' && candidates.length > 0 && candidates.every((e) => e.ps.unscoredReason === UNSCORED.noRoute)) {
    return { hint: 'Route distance missing', help: "Record the nav route's distance (km effort) on the result or its course to unlock NAV." };
  }
  if (key === 'DSC' && candidates.length > 0 && candidates.every((e) => e.ps.unscoredReason === UNSCORED.notClean)) {
    return { hint: def.hint, help: 'Only clean descent runs are scored: complete a clean run to unlock DSC.' };
  }
  if (candidates.some((e) => e.ps.score != null && e.ps.expired)) {
    return { hint: def.hint, help: `The last result is over ${config.freshness.expireMonths} months old. ${def.help}` };
  }
  if (intended.some((e) => !e.perf.verified)) {
    return { hint: def.hint, help: `A result is waiting to be verified: tick it to unlock ${key}.` };
  }
  return def;
}

function lockedStat<K extends RatingKey>(key: K, lock: Lock, config: Config): StatValue & { key: K } {
  return { key, locked: true, shielded: false, unlockHint: lock.hint, unlockHelp: lock.help, provisional: false, configVersion: config.version };
}

/** Races are named by their event ("Hachimantai Hill Race"); course runs by their course. */
function placeName(e: Entry, key: StatKey): string {
  if (KIND_LABEL[e.perf.kind]) return e.ctx.event?.name ?? e.ctx.course?.name ?? KIND_LABEL[e.perf.kind];
  return e.ctx.course?.name ?? e.ctx.event?.name ?? DEFAULT_PLACE[key];
}

/** 'from bleep test, 10 Nov', 'from 10 km, 12 Aug', 'from Campus Circuit, 4 Nov' */
function basisLabel(e: Entry, key: StatKey): string {
  const date = formatShortDate(e.perf.date);
  if (key === 'END') {
    if (e.perf.kind === 'bleep') return `from bleep test, ${date}`;
    return e.ctx.distanceKm != null ? `from ${formatKm(e.ctx.distanceKm)}, ${date}` : `from ${placeName(e, key)}, ${date}`;
  }
  return `from ${placeName(e, key)}, ${date}`;
}

/**
 * Growth Shield (spec 3.8): when enabled and the streak is active or frozen, the displayed stat is
 * max(current, peak12m − margin), where peak12m is the highest unpenalised score for the stat in the
 * last windowMonths. A locked stat stays locked (this is only called for unlocked stats).
 */
function withShield(key: StatKey, current: number, basis: StatBasis, provisional: boolean, entries: Entry[], input: StatsInput): StatValue {
  const { config } = input;
  const peakEntry = entries.filter((e) => e.ps.feeds.includes(key) && e.ps.score != null && e.ps.monthsOld < config.growthShield.windowMonths).sort(byScoreDesc)[0];
  const peak12m = peakEntry?.ps.score;
  const out: StatValue = { key, locked: false, value: current, current, peak12m, shielded: false, provisional, basis, configVersion: config.version };
  if (!config.growthShield.enabled || !input.streakActiveOrFrozen || !peakEntry || peak12m == null) return out;
  const floor = peak12m - config.growthShield.margin;
  if (floor <= current) return out;
  // The shielded number comes from the peak result, so that is the basis the card dates.
  return {
    ...out,
    value: floor,
    shielded: true,
    provisional: provisional || peakEntry.ps.provisional,
    basis: { perfIds: [peakEntry.perf.id, ...basis.perfIds.filter((id) => id !== peakEntry.perf.id)], date: peakEntry.perf.date, label: `${basisLabel(peakEntry, key)} · Growth Shield` },
  };
}

/** SPD, CLB, DSC and NAV: best FreshScore among the stat's current results. */
function bestFreshStat(key: StatKey, entries: Entry[], input: StatsInput): StatValue {
  const best = entries.filter((e) => e.ps.feeds.includes(key) && e.ps.fresh != null).sort(byFreshDesc)[0];
  if (!best || best.ps.fresh == null) return lockedStat(key, lockFor(key, entries, input.config, input.asOf), input.config);
  const basis: StatBasis = { perfIds: [best.perf.id], date: best.perf.date, label: basisLabel(best, key) };
  return withShield(key, best.ps.fresh, basis, best.ps.provisional, entries, input);
}

/**
 * Best ARM level per domain in the last config.arm.windowMonths (ARM never falls on a bad retest). The
 * window is strict: a test exactly windowMonths old is out. A domain measured only below L1 keeps level 0
 * in `levels` but is listed in `missing` (levels run 1–5, so it has no level yet).
 */
function armLevelsInWindow(entries: Entry[], config: Config): { levels: ArmLevels; byDomain: Partial<Record<ArmDomain, Entry>> } {
  const tests = entries.filter((e) => e.perf.kind === 'arm' && e.ps.feeds.includes('ARM') && e.ps.monthsOld < config.arm.windowMonths);
  const best: Partial<Record<ArmDomain, { level: number; entry: Entry }>> = {};
  for (const e of tests) {
    const lv = armLevelsFromTest(e.perf.arm, config);
    for (const d of ARM_DOMAINS) {
      const l = lv[d];
      if (l == null) continue;
      const cur = best[d];
      // Higher level wins; on a tie the more recent test is the basis.
      if (!cur || l > cur.level || (l === cur.level && byDate(cur.entry.perf, e.perf) < 0)) best[d] = { level: l, entry: e };
    }
  }
  const levels: ArmLevels = {
    ankle: best.ankle?.level,
    calf: best.calf?.level,
    balance: best.balance?.level,
    missing: ARM_DOMAINS.filter((d) => !((best[d]?.level ?? 0) >= 1)),
  };
  const byDomain: Partial<Record<ArmDomain, Entry>> = {};
  for (const d of ARM_DOMAINS) {
    const b = best[d];
    if (b) byDomain[d] = b.entry;
  }
  return { levels, byDomain };
}

/** 'ankle (5 cm knee-to-wall)': what level 1 needs in a domain. */
function armLevel1(d: ArmDomain, config: Config): string {
  const a = config.arm;
  if (d === 'ankle') return `ankle (${a.ankleCm[0]} cm knee-to-wall)`;
  if (d === 'calf') return `calf (${a.calfReps[0]} heel raises)`;
  return `balance (${a.storkSec[0]} s eyes-closed stance)`;
}

/** Lock for ARM when some domains have no level: untested domains, and domains measured below L1. */
function armLock(levels: ArmLevels, entries: Entry[], config: Config, asOf: ISODate): Lock {
  const win = `tests from the last ${config.arm.windowMonths} months count`;
  const untested = levels.missing.filter((d) => levels[d] == null);
  const below = levels.missing.filter((d) => levels[d] != null);
  if (untested.length === ARM_DOMAINS.length) {
    // Nothing in the window: say so when there are older tests.
    const older = entries.filter((e) => e.perf.kind === 'arm' && e.ps.feeds.includes('ARM') && e.ps.monthsOld >= config.arm.windowMonths);
    const last = older[older.length - 1];
    if (last) {
      return { hint: 'Retest all three', help: `The last ARM test (${formatLongDate(last.perf.date)}) is over ${config.arm.windowMonths} months old: retest ankle, calf and balance to unlock ARM.` };
    }
    return lockFor('ARM', entries, config, asOf);
  }
  const reach = below.length ? `reach level 1 in ${listWords(below.map((d) => armLevel1(d, config)))}` : '';
  if (untested.length === 0) {
    return { hint: 'Reach level 1', help: `${reach[0].toUpperCase()}${reach.slice(1)} to unlock ARM (${win}).` };
  }
  const test = `Test ${listWords(untested)}`;
  const hint = below.length ? 'Finish ARM tests' : untested.length === 1 ? `Test ${untested[0]}` : 'Finish ARM tests';
  return { hint, help: below.length ? `${test}, and ${reach}, to unlock ARM (${win}).` : `${test} to unlock ARM (${win}).` };
}

/**
 * ARM = round(40 + (sumOfLevels − 3) × 59 / 12) once all three domains have a level (L1 or better).
 * Otherwise locked, naming the domains still to test and those below level 1. No freshness decay: the
 * window replaces it.
 */
function armStat(levels: ArmLevels, byDomain: Partial<Record<ArmDomain, Entry>>, entries: Entry[], input: StatsInput): StatValue {
  const { config } = input;
  const { ankle, calf, balance, missing } = levels;
  if (missing.length > 0 || ankle == null || calf == null || balance == null) {
    return lockedStat('ARM', armLock(levels, entries, config, input.asOf), config);
  }
  const tests = [...new Set(ARM_DOMAINS.flatMap((d) => byDomain[d] ?? []))].sort((a, b) => -byDate(a.perf, b.perf));
  const date = tests[0].perf.date;
  const basis: StatBasis = { perfIds: tests.map((e) => e.perf.id), date, label: `from ARM test${tests.length > 1 ? 's' : ''}, ${formatShortDate(date)}` };
  return withShield('ARM', armScoreClamped({ ankle, calf, balance }, config), basis, config.arm.provisional, entries, input);
}

/** END = max(bleepRating, longRunRating); the basis says which pathway set it. */
function endStat(entries: Entry[], input: StatsInput): StatValue {
  // Both pathways are END feeds; the best FreshScore of either wins (a tie goes to the bleep test).
  const pool = entries.filter((e) => e.ps.feeds.includes('END') && e.ps.fresh != null);
  const bleep = pool.filter((e) => e.perf.kind === 'bleep').sort(byFreshDesc)[0];
  const long = pool.filter((e) => e.perf.kind !== 'bleep').sort(byFreshDesc)[0];
  const best = bleep && long ? ((long.ps.fresh ?? 0) > (bleep.ps.fresh ?? 0) ? long : bleep) : (bleep ?? long);
  if (!best || best.ps.fresh == null) return lockedStat('END', lockFor('END', entries, input.config, input.asOf), input.config);
  const basis: StatBasis = { perfIds: [best.perf.id], date: best.perf.date, label: basisLabel(best, 'END') };
  return withShield('END', best.ps.fresh, basis, best.ps.provisional, entries, input);
}

/** 'Hachimantai XC 4 km · 16:15' */
function raceLine(e: Entry): string {
  const name = e.ctx.event?.name ?? e.ctx.course?.name ?? KIND_LABEL[e.perf.kind] ?? 'Race';
  const dist = e.ctx.distanceKm != null ? ` ${formatKm(e.ctx.distanceKm)}` : '';
  const time = e.perf.timeSec != null ? ` · ${formatTime(e.perf.timeSec)}` : '';
  return `${name}${dist}${time}`;
}

/**
 * RACE (spec 3.9): verified race, relay_leg and parkrun FreshScores (RunScore, or the fixed benchmark on a
 * fixed-mode course). Top three weighted 0.50/0.30/0.20; two 0.60/0.40; one 1.00; rounded. No Growth Shield.
 */
function raceStat(entries: Entry[], own: Performance[], input: StatsInput): RaceStat {
  const { config, asOf } = input;
  // Caps are lifetime, but only for results with a real date on or before the as-of date.
  const caps = raceCaps(own.filter((p) => isISODate(p.date) && p.date <= asOf));
  const pool = entries.filter((e) => e.ps.feeds.includes('RACE') && e.ps.fresh != null).sort(byFreshDesc);
  const top = pool.slice(0, 3);
  if (top.length === 0) return { ...lockedStat('RACE', lockFor('RACE', entries, config, asOf), config), caps };
  const weights = top.length === 3 ? config.race.weights3 : top.length === 2 ? config.race.weights2 : [1];
  const value = roundScore(top.reduce((sum, e, i) => sum + (weights[i] ?? 0) * (e.ps.fresh ?? 0), 0));
  const best = top[0];
  return {
    key: 'RACE',
    locked: false,
    value,
    current: value,
    shielded: false,
    provisional: top.some((e) => e.ps.provisional),
    basis: { perfIds: top.map((e) => e.perf.id), date: best.perf.date, label: `from ${top.length} race${top.length === 1 ? '' : 's'}, best ${formatShortDate(best.perf.date)}` },
    configVersion: config.version,
    caps,
    bestRaceLine: raceLine(best),
    bestRacePerfId: best.perf.id,
  };
}

export interface NavReference {
  secPerKm: number;
  perfId: string;
  /** circuit: best-ever Circuit pace; race: best race pace up to nav.refRaceMaxKmEff; riegel: predicted for the route. */
  source: 'circuit' | 'race' | 'riegel';
  /** Riegel only: the race's effective distance and time, and the predicted route time. */
  raceKmEff?: number;
  raceSec?: number;
  predictedRouteSec?: number;
}

/**
 * NAV reference pace (s/km on D_eff): the athlete's best-ever verified Circuit pace (a PB, so jogging a
 * later test cannot help); with no Circuit, the best verified race, relay leg or parkrun pace with
 * D_eff ≤ config.nav.refRaceMaxKmEff. With neither (go-live plan 6), and a route distance given, the route
 * time is predicted from a recent verified race of any distance by Riegel scaling,
 * T_route = T × (route ÷ race D_eff)^nav.riegelExponent, using the race that predicts the fastest route
 * time among races not older than freshness.expireMonths. Results after asOf (when given) are ignored.
 */
export function navReferencePace(
  perfs: Performance[],
  lookup: Lookup,
  config: Config,
  athlete: Athlete,
  asOf?: ISODate,
  routeKmEff?: number,
): NavReference | undefined {
  const paces = perfs
    .filter((p) => p.athleteId === athlete.id && counts(p) && (asOf == null || p.date <= asOf) && p.timeSec != null && Number.isFinite(p.timeSec) && p.timeSec > 0)
    .flatMap((p) => {
      const ctx = resolveContext(p, lookup);
      return ctx.dEff != null && ctx.dEff > 0 && p.timeSec != null ? [{ p, dEff: ctx.dEff, pace: p.timeSec / ctx.dEff }] : [];
    });
  const pick = (xs: typeof paces) => xs.slice().sort((a, b) => a.pace - b.pace || byDate(a.p, b.p))[0];
  const circuit = pick(paces.filter((x) => x.p.kind === 'circuit'));
  if (circuit) return { secPerKm: circuit.pace, perfId: circuit.p.id, source: 'circuit' };
  const races = paces.filter((x) => x.p.kind === 'race' || x.p.kind === 'relay_leg' || x.p.kind === 'parkrun');
  const race = pick(races.filter((x) => x.dEff <= config.nav.refRaceMaxKmEff + 1e-9));
  if (race) return { secPerKm: race.pace, perfId: race.p.id, source: 'race' };
  if (!(routeKmEff != null && routeKmEff > 0 && Number.isFinite(routeKmEff))) return undefined;
  const k = config.nav.riegelExponent;
  const recent = races.filter((x) => asOf == null || monthsBetween(x.p.date, asOf) <= config.freshness.expireMonths);
  const predicted = recent
    .map((x) => ({ x, sec: x.p.timeSec! * Math.pow(routeKmEff / x.dEff, k) }))
    .sort((a, b) => a.sec - b.sec || -byDate(a.x.p, b.x.p))[0];
  if (!predicted || !Number.isFinite(predicted.sec)) return undefined;
  return { secPerKm: predicted.sec / routeKmEff, perfId: predicted.x.p.id, source: 'riegel', raceKmEff: predicted.x.dEff, raceSec: predicted.x.p.timeSec, predictedRouteSec: predicted.sec };
}

/**
 * Tier (spec 3.10). Icon: caps ≥ iconMinCaps and RACE ≥ iconMinRace (whatever the OVR). Otherwise by OVR:
 * bronze < silverMin ≤ silver < goldMin ≤ gold, and gold also needs goldMinCaps race caps (else silver with
 * a note). No OVR ('—') → bronze.
 */
export function tierFor(ovr: OvrValue, race: RaceStat, config: Config): { tier: Tier; note?: string } {
  const t = config.tiers;
  if (race.caps >= t.iconMinCaps && !race.locked && race.value != null && race.value >= t.iconMinRace) return { tier: 'icon' };
  if (ovr.value == null) return { tier: 'bronze' };
  if (ovr.value >= t.goldMin) {
    if (race.caps >= t.goldMinCaps) return { tier: 'gold' };
    return { tier: 'silver', note: `Gold needs at least ${t.goldMinCaps} race cap${t.goldMinCaps === 1 ? '' : 's'}` };
  }
  return { tier: ovr.value >= t.silverMin ? 'silver' : 'bronze' };
}

/** OVR = round(mean of the unlocked stats among the six); '—' when fewer than config.ovr.minUnlocked. */
export function ovrFrom(stats: Record<StatKey, StatValue>, config: Config): OvrValue {
  const values = STAT_KEYS.flatMap((k) => (!stats[k].locked && stats[k].value != null ? [stats[k].value as number] : []));
  const unlocked = values.length;
  if (unlocked === 0 || unlocked < config.ovr.minUnlocked) return { unlocked, display: '—' };
  const value = roundScore(values.reduce((a, b) => a + b, 0) / unlocked);
  return { value, unlocked, display: String(value) };
}

/** Every rating for one athlete as of a date. Only live, verified results feed ratings; all are listed. */
export function computeAthleteRatings(input: StatsInput): AthleteRatings {
  const { athlete, lookup, config, asOf } = input;
  const own = input.perfs.filter((p) => p.athleteId === athlete.id).sort(byDate);
  const navRef = navReferencePace(own, lookup, config, athlete, asOf);
  const entries: Entry[] = own.map((perf) => {
    const ctx = resolveContext(perf, lookup);
    // With no Circuit or short race, each nav route gets its own Riegel-predicted reference pace.
    const ref = perf.kind === 'nav' && !navRef ? navReferencePace(own, lookup, config, athlete, asOf, perf.routeKmEff ?? ctx.dEff) : navRef;
    return { perf, ctx, ps: scorePerformance(ctx, athlete, config, asOf, { navRefPaceSecPerKm: ref?.secPerKm }) };
  });

  const { levels, byDomain } = armLevelsInWindow(entries, config);
  const stats: Record<StatKey, StatValue> = {
    SPD: bestFreshStat('SPD', entries, input),
    END: endStat(entries, input),
    CLB: bestFreshStat('CLB', entries, input),
    DSC: bestFreshStat('DSC', entries, input),
    NAV: bestFreshStat('NAV', entries, input),
    ARM: armStat(levels, byDomain, entries, input),
  };
  const race = raceStat(entries, own, input);
  const ovr = ovrFrom(stats, config);
  const { tier, note } = tierFor(ovr, race, config);
  const now = ageOnDate(athlete, asOf, config, asOf);

  return {
    athleteId: athlete.id,
    configVersion: config.version,
    asOf,
    ageNow: { age: now.age, estimated: now.estimated },
    stats,
    race,
    ovr,
    tier,
    tierNote: note,
    arm: levels,
    perfScores: entries.map((e) => e.ps),
    provisionalAny: [...STAT_KEYS.map((k) => stats[k]), race].some((s) => !s.locked && s.provisional),
  };
}
