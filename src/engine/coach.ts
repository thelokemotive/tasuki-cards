// Coaching layer for the Yama release: the summit ladder (what the next tier needs), a development focus
// for each runner (what to work on, with session ideas), the coach's setup checklist and to-dos, the week's
// level-ups (for the projector reveal), the biggest climbers (improvement since a date) and the house cup.
// Pure functions over derived data: nothing here changes a rating.
import type { DataSnapshot, ISODate } from '../types';
import type { Config } from './config';
import type { AthleteDerived, Derived } from './derive';
import type { RatingKey, StatKey, Tier } from './types';
import { STAT_KEYS } from './types';
import { addDays, formatShortDate, isoWeek, monthsBetween } from './dates';
import { counts } from './perf';

// ---------------------------------------------------------------------------------------------------
// Summit ladder

/** The four camps of the climb: tier → place on the mountain (Japanese for flavour). */
export const CAMPS: Record<Tier, { name: string; jp: string; blurb: string }> = {
  bronze: { name: 'Foothills', jp: '麓', blurb: 'Every runner starts here.' },
  silver: { name: 'Forest line', jp: '森', blurb: 'Steady climbing through the trees.' },
  gold: { name: 'The ridge', jp: '稜線', blurb: 'Above the trees, the view opens up.' },
  icon: { name: 'Summit', jp: '山頂', blurb: 'Racing week in, week out, at the top of the age-graded tables.' },
};

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'icon'];

export interface LadderStep {
  /** What is missing, in words a student can act on: '4 more OVR points', '1 race cap', 'unlock 1 more stat'. */
  text: string;
  done: boolean;
}

export interface SummitLadder {
  tier: Tier;
  next?: Tier;
  /** 0–1: how far from this camp to the next (by OVR for silver and gold, by caps and RACE for the summit). */
  progress: number;
  /** What the next camp needs; empty at the summit. */
  steps: LadderStep[];
  /** One line: 'Silver needs 4 more OVR points.' */
  headline: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summitLadder(d: AthleteDerived, config: Config): SummitLadder {
  const r = d.ratings;
  const t = config.tiers;
  const ovr = r.ovr.value;
  const caps = r.race.caps;
  const race = r.race.locked ? undefined : r.race.value;
  const unlockSteps = (): LadderStep[] =>
    ovr == null ? [{ text: `unlock ${plural(config.ovr.minUnlocked - r.ovr.unlocked, 'more stat')} to get an OVR`, done: false }] : [];
  switch (r.tier) {
    case 'bronze': {
      const steps = [...unlockSteps(), { text: ovr == null ? `OVR ${t.silverMin}` : `${plural(Math.max(0, t.silverMin - ovr), 'more OVR point')} (OVR ${t.silverMin})`, done: ovr != null && ovr >= t.silverMin }];
      const progress = ovr == null ? 0 : Math.max(0, Math.min(1, (ovr - config.runScore.min) / (t.silverMin - config.runScore.min)));
      return { tier: 'bronze', next: 'silver', progress, steps, headline: ovr == null ? `Unlock ${plural(config.ovr.minUnlocked - r.ovr.unlocked, 'more stat')} to start the climb.` : `Silver needs ${plural(t.silverMin - ovr, 'more OVR point')}.` };
    }
    case 'silver': {
      const needOvr = Math.max(0, t.goldMin - (ovr ?? 0));
      const needCaps = Math.max(0, t.goldMinCaps - caps);
      const steps: LadderStep[] = [
        { text: needOvr ? `${plural(needOvr, 'more OVR point')} (OVR ${t.goldMin})` : `OVR ${t.goldMin}`, done: needOvr === 0 },
        { text: needCaps ? `${plural(needCaps, 'race cap')} ★` : `${plural(t.goldMinCaps, 'race cap')} ★`, done: needCaps === 0 },
      ];
      const progress = Math.max(0, Math.min(1, ((ovr ?? t.silverMin) - t.silverMin) / (t.goldMin - t.silverMin)));
      const parts = [needOvr ? plural(needOvr, 'more OVR point') : '', needCaps ? plural(needCaps, 'race cap') : ''].filter(Boolean);
      return { tier: 'silver', next: 'gold', progress, steps, headline: `Gold needs ${parts.join(' and ')}.` };
    }
    case 'gold': {
      const needCaps = Math.max(0, t.iconMinCaps - caps);
      const needRace = race == null ? t.iconMinRace : Math.max(0, t.iconMinRace - race);
      const steps: LadderStep[] = [
        { text: needCaps ? `${plural(needCaps, 'more race cap')} (${t.iconMinCaps} ★)` : `${t.iconMinCaps} race caps ★`, done: needCaps === 0 },
        { text: race == null ? `a RACE rating of ${t.iconMinRace}` : needRace ? `${plural(needRace, 'more RACE point')} (RACE ${t.iconMinRace})` : `RACE ${t.iconMinRace}`, done: race != null && needRace === 0 },
      ];
      const progress = (Math.min(1, caps / t.iconMinCaps) + (race == null ? 0 : Math.min(1, race / t.iconMinRace))) / 2;
      const parts = [needCaps ? plural(needCaps, 'more race cap') : '', race == null || needRace ? (race == null ? `a RACE rating of ${t.iconMinRace}` : `${plural(needRace, 'more RACE point')}`) : ''].filter(Boolean);
      return { tier: 'gold', next: 'icon', progress, steps, headline: `The summit (Icon) needs ${parts.join(' and ')}.` };
    }
    case 'icon':
      return { tier: 'icon', progress: 1, steps: [], headline: 'At the summit. Keep racing to stay there.' };
  }
}

// ---------------------------------------------------------------------------------------------------
// Development focus

/** Session ideas per stat: short, practical, for the coach to pick from. */
export const SESSION_IDEAS: Record<StatKey, string[]> = {
  SPD: ['Strides: 6–8 × 100 m relaxed-fast, full recovery', 'Short reps: 8 × 200 m at 3K effort', 'Race the Circuit or a short race'],
  END: ['One steady long run a week, building about 10% a time', 'Easy runs that stay easy (can talk in sentences)', 'A tempo block: 2 × 8 min comfortably hard'],
  CLB: ['Hill reps: 6–10 × 60–90 s uphill, jog down', 'Power-hiking with hands on knees on the steepest bits', 'A hilly long run on the trails'],
  DSC: ['Descending drills: quick light feet, eyes 3–4 m ahead', 'Short downhill strides on grass, then on the trail', 'Ankle and calf strength (ARM work helps here)'],
  NAV: ['Map walk: keep the map turned to the ground (set the map)', 'Thumbing the map on a short loop', 'A butterfly or score course in pairs'],
  ARM: ['10 minutes, three times a week: calf raises, single-leg balance, ankle mobility', 'Hop-and-stick practice on both legs', 'Retest after 6 weeks'],
};

export interface FocusItem {
  kind: 'superpower' | 'focus' | 'unlock' | 'refresh';
  stat: StatKey;
  text: string;
  ideas: string[];
}

/**
 * What to work on, most useful first:
 * - focus: the weakest unlocked stat, when it is at least `gap` below the runner's own average (not the squad's);
 * - unlock: locked stats, with how to unlock them (a fuller card, not a higher OVR: OVR averages unlocked stats);
 * - refresh: a stat resting on a result old enough to be losing points to freshness;
 * - superpower: the strongest stat, so every runner hears what they are good at.
 */
export function developmentFocus(d: AthleteDerived, config: Config, gap = 5): FocusItem[] {
  const r = d.ratings;
  const unlocked = STAT_KEYS.filter((k) => !r.stats[k].locked && r.stats[k].value != null);
  const out: FocusItem[] = [];
  const avg = unlocked.length ? unlocked.reduce((s, k) => s + (r.stats[k].value ?? 0), 0) / unlocked.length : undefined;
  const sorted = [...unlocked].sort((a, b) => (r.stats[a].value ?? 0) - (r.stats[b].value ?? 0));
  if (avg != null && unlocked.length >= 2) {
    const weakest = sorted[0];
    const w = r.stats[weakest].value ?? 0;
    if (avg - w >= gap) out.push({ kind: 'focus', stat: weakest, text: `${weakest} ${w} is ${Math.round(avg - w)} below the runner's own average (${Math.round(avg)}): the quickest way up.`, ideas: SESSION_IDEAS[weakest] });
  }
  for (const k of STAT_KEYS) {
    const s = r.stats[k];
    if (s.locked) out.push({ kind: 'unlock', stat: k, text: `Unlock ${k}: ${s.unlockHelp ?? s.unlockHint ?? ''}`.trim(), ideas: SESSION_IDEAS[k] });
  }
  for (const k of unlocked) {
    const s = r.stats[k];
    const months = s.basis?.date ? monthsBetween(s.basis.date, r.asOf) : 0;
    if (k !== 'ARM' && months > config.freshness.decayGraceMonths) {
      out.push({ kind: 'refresh', stat: k, text: `${k} rests on a result from ${s.basis?.date ? formatShortDate(s.basis.date) : 'a while ago'} (${months} months old) and loses ${config.freshness.decayPointsPerMonth} a month: a new ${k} result would freshen it.`, ideas: SESSION_IDEAS[k].slice(-1) });
    }
  }
  if (sorted.length) {
    const best = sorted[sorted.length - 1];
    out.push({ kind: 'superpower', stat: best, text: `Superpower: ${best} ${r.stats[best].value}.`, ideas: [] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Coach's setup checklist and to-dos

export interface CheckItem {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
  /** In-app link (hash path) that fixes it. */
  to?: string;
  optional?: boolean;
}

export function setupChecklist(snapshot: DataSnapshot, derived: Derived, today: ISODate): CheckItem[] {
  const real = snapshot.athletes.filter((a) => !a.demo);
  const halfTermNow = snapshot.calendar.halfTerms.some((h) => h.start <= today && today <= h.end);
  const fixed = snapshot.courses.filter((c) => !c.demo && c.benchmarkMode === 'fixed');
  const missing = fixed.filter((c) => !c.t99OpenM || !c.t99OpenF);
  const coach = real.find((a) => a.yearGroup === 'Staff');
  const backupDays = snapshot.meta.lastBackupAt ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(snapshot.meta.lastBackupAt)) / 86400000) : undefined;
  const items: CheckItem[] = [
    { id: 'roster', label: 'Roster added', done: real.length > 0, detail: real.length ? `${real.length} athletes` : 'Import it, or paste a results table and add runners from it', to: '/roster' },
    { id: 'demo', label: 'Demo data cleared', done: !snapshot.meta.demoLoaded, detail: snapshot.meta.demoLoaded ? 'Invented athletes are still loaded' : undefined, to: '/settings?tab=data' },
    { id: 'halfterm', label: 'This half-term set', done: halfTermNow, detail: halfTermNow ? undefined : 'Streak freezes need half-terms', to: '/settings?tab=calendar' },
    { id: 'holidays', label: 'Holiday weeks set', done: snapshot.calendar.holidayWeeks.length > 0, to: '/settings?tab=calendar' },
    { id: 'courses', label: 'Climb, descent and nav courses', done: snapshot.courses.filter((c) => !c.demo && c.kind !== 'circuit').length > 0, to: '/settings?tab=courses' },
    { id: 'benchmarks', label: 'Descent benchmarks set', done: fixed.length > 0 && missing.length === 0, detail: missing.length ? `${missing.map((c) => c.name).join(', ')}: no 99-point time yet` : fixed.length ? undefined : 'Add a descent course first', to: '/settings?tab=courses' },
    { id: 'coach', label: 'You on the roster (Staff, with a date of birth)', done: !!coach?.dob, detail: coach ? (coach.dob ? undefined : 'Add your date of birth for reference-run benchmarks') : 'For "against Mr Loke" benchmarks', to: coach ? `/athlete/${coach.id}` : '/roster', optional: true },
    { id: 'backup', label: 'Backed up this week', done: backupDays != null && backupDays <= derived.config.backup.reminderDays, detail: backupDays == null ? 'Never' : `${backupDays} days ago`, to: '/settings?tab=data' },
  ];
  return items;
}

export interface ToDo {
  id: string;
  text: string;
  to?: string;
  count: number;
}

/** Active students with no result and no participation in the last `days` days (re-engage them). */
export function notSeenLately(snapshot: DataSnapshot, derived: Derived, days = 21): AthleteDerived[] {
  const since = addDays(derived.asOf, -days);
  const seen = new Set<string>();
  for (const p of snapshot.performances) if (!p.deleted && p.date >= since && p.date <= derived.asOf) seen.add(p.athleteId);
  for (const q of snapshot.participation) if (q.date >= since && q.date <= derived.asOf) seen.add(q.athleteId);
  return [...derived.athletes.values()].filter((d) => d.athlete.active && d.athlete.yearGroup !== 'Staff' && !seen.has(d.athlete.id));
}

export function coachToDos(snapshot: DataSnapshot, derived: Derived): ToDo[] {
  const out: ToDo[] = [];
  const unverified = snapshot.performances.filter((p) => !p.deleted && !p.verified);
  if (unverified.length) out.push({ id: 'unverified', text: `${plural(unverified.length, 'student-reported result')} to verify`, to: `/athlete/${unverified[0].athleteId}`, count: unverified.length });
  const active = [...derived.athletes.values()].filter((d) => d.athlete.active && d.athlete.yearGroup !== 'Staff');
  const lost = notSeenLately(snapshot, derived);
  if (lost.length) out.push({ id: 'lost', text: `${plural(lost.length, 'runner')} not seen for 3 weeks: a quick word goes a long way`, to: '/roster', count: lost.length });
  for (const k of ['ARM', 'NAV', 'END', 'CLB', 'DSC'] as StatKey[]) {
    const locked = active.filter((d) => d.ratings.stats[k].locked).length;
    if (active.length >= 4 && locked >= Math.max(3, active.length / 2)) {
      const what = { ARM: 'an ARM screening', NAV: 'a nav session', END: 'a bleep test', CLB: 'a climb-course session', DSC: 'a descent session', SPD: 'a Circuit' }[k];
      out.push({ id: `locked-${k}`, text: `${locked} of ${active.length} cards have ${k} locked: ${what} would unlock them`, count: locked });
    }
  }
  const noDob = active.filter((d) => !d.athlete.dob).length;
  if (noDob) out.push({ id: 'dob', text: `${plural(noDob, 'athlete')} without a date of birth (ages are estimated from the year group)`, to: '/roster', count: noDob });
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Level-ups (the projector reveal) and climbers

export interface LevelUp {
  athleteId: string;
  /** Bigger = more dramatic; the reveal shows them smallest first. */
  weight: number;
  /** 'SPD 71 → 74', 'Silver → Gold', 'PB −12 s on Campus Circuit', 'New badge: First 10K' */
  lines: string[];
  tierUp?: { from: Tier; to: Tier };
  statsUp: { key: RatingKey | 'OVR'; from?: number; to: number }[];
}

const val = (d: AthleteDerived | undefined, k: RatingKey | 'OVR'): number | undefined => {
  if (!d) return undefined;
  const r = d.ratings;
  if (k === 'OVR') return r.ovr.value;
  const s = k === 'RACE' ? r.race : r.stats[k];
  return s.locked ? undefined : s.value;
};

/** What went up between two derivations (the week's reveal): tiers, ratings, unlocks, PBs and new badges. */
export function levelUps(before: Derived, after: Derived): LevelUp[] {
  const out: LevelUp[] = [];
  for (const d of after.athletes.values()) {
    if (!d.athlete.active) continue;
    const b = before.athletes.get(d.athlete.id);
    const lines: string[] = [];
    const statsUp: LevelUp['statsUp'] = [];
    let weight = 0;
    const tierUp = b && TIER_ORDER.indexOf(d.ratings.tier) > TIER_ORDER.indexOf(b.ratings.tier) ? { from: b.ratings.tier, to: d.ratings.tier } : undefined;
    if (tierUp) {
      lines.push(`${cap(tierUp.from)} → ${cap(tierUp.to)}: ${CAMPS[tierUp.to].name} ${CAMPS[tierUp.to].jp}`);
      weight += 40 + 10 * TIER_ORDER.indexOf(tierUp.to);
    }
    for (const k of ['OVR', 'RACE', ...STAT_KEYS] as (RatingKey | 'OVR')[]) {
      const x = val(b, k);
      const y = val(d, k);
      if (y == null) continue;
      if (x == null) {
        statsUp.push({ key: k, to: y });
        lines.push(`${k} unlocked: ${y}`);
        weight += 6;
      } else if (y > x) {
        statsUp.push({ key: k, from: x, to: y });
        lines.push(`${k} ${x} → ${y}`);
        weight += (y - x) * (k === 'OVR' ? 3 : 1.5);
      }
    }
    for (const e of d.inForm) {
      if (e.type === 'raw' && e.date > before.asOf) {
        lines.push(`${e.text} · ${e.label}`);
        weight += 5;
      }
    }
    const oldBadges = new Set(b?.badges.map((x) => x.key) ?? []);
    for (const badge of d.badges) {
      if (!oldBadges.has(badge.key)) {
        lines.push(`New badge: ${badge.icon} ${badge.label}`);
        weight += badge.kind === 'record' || badge.kind === 'surge' ? 12 : 4;
      }
    }
    if (lines.length) out.push({ athleteId: d.athlete.id, weight, lines, tierUp, statsUp });
  }
  return out.sort((x, y) => x.weight - y.weight || (x.athleteId < y.athleteId ? -1 : 1));
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface Climber {
  athleteId: string;
  /** OVR change (or, with no OVR before, the stats unlocked). */
  delta: number;
  from?: number;
  to?: number;
  /** The single stat that rose most. */
  best?: { key: StatKey; from: number; to: number };
}

/** Biggest improvers between two dates, by OVR change, then by the best single-stat rise. Active athletes only. */
export function climbers(before: Derived, after: Derived): Climber[] {
  const out: Climber[] = [];
  for (const d of after.athletes.values()) {
    if (!d.athlete.active) continue;
    const b = before.athletes.get(d.athlete.id);
    const from = val(b, 'OVR');
    const to = val(d, 'OVR');
    let best: Climber['best'];
    for (const k of STAT_KEYS) {
      const x = val(b, k);
      const y = val(d, k);
      if (x != null && y != null && y > x && (!best || y - x > best.to - best.from)) best = { key: k, from: x, to: y };
    }
    const delta = from != null && to != null ? to - from : 0;
    if (delta > 0 || best) out.push({ athleteId: d.athlete.id, delta, from, to, best });
  }
  return out.sort((x, y) => y.delta - x.delta || (y.best ? y.best.to - y.best.from : 0) - (x.best ? x.best.to - x.best.from : 0) || (x.athleteId < y.athleteId ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------------
// House cup: turning up and improving, never ability

export const HOUSE_POINTS = { week: 1, pb: 3, cap: 2, surgeBronze: 5, surgeGold: 10 } as const;

export interface HouseScore {
  house: string;
  members: number;
  points: number;
  /** points ÷ members, so a small house can win. */
  perMember: number;
  weeks: number;
  pbs: number;
  caps: number;
  surges: number;
}

/**
 * Points between `from` and `to` (inclusive): a counted streak week 1, a PB 3, a race cap 2, a Surge medal
 * 5 (bronze) or 10 (gold). Ranked by points per member. Athletes without a house are left out.
 */
export function houseCup(derived: Derived, from: ISODate, to: ISODate): HouseScore[] {
  const byHouse = new Map<string, HouseScore>();
  const wFrom = isoWeek(from);
  const wTo = isoWeek(to);
  for (const d of derived.athletes.values()) {
    const house = d.athlete.house?.trim();
    if (!house || !d.athlete.active) continue;
    const h = byHouse.get(house) ?? { house, members: 0, points: 0, perMember: 0, weeks: 0, pbs: 0, caps: 0, surges: 0 };
    h.members++;
    const weeks = d.streak.weeks.filter((w) => w.state === 'counted' && w.week >= wFrom && w.week <= wTo).length;
    const pbs = d.pbHistory.filter((pb) => pb.previousBest != null && pb.date >= from && pb.date <= to).length;
    const caps = d.perfs.filter((p) => counts(p) && (p.kind === 'race' || p.kind === 'relay_leg') && p.date >= from && p.date <= to).length;
    const medals = d.surges.filter((s) => s.medal && (d.perfs.find((p) => p.id === s.perfId)?.date ?? '') >= from && (d.perfs.find((p) => p.id === s.perfId)?.date ?? '') <= to);
    h.weeks += weeks;
    h.pbs += pbs;
    h.caps += caps;
    h.surges += medals.length;
    h.points += weeks * HOUSE_POINTS.week + pbs * HOUSE_POINTS.pb + caps * HOUSE_POINTS.cap + medals.reduce((s, m) => s + (m.medal === 'gold' ? HOUSE_POINTS.surgeGold : HOUSE_POINTS.surgeBronze), 0);
    byHouse.set(house, h);
  }
  return [...byHouse.values()].map((h) => ({ ...h, perMember: h.members ? Math.round((h.points / h.members) * 10) / 10 : 0 })).sort((a, b) => b.perMember - a.perMember || b.points - a.points || a.house.localeCompare(b.house));
}

/** The window for "this half-term": the half-term containing `asOf`, else the last six weeks. */
export function currentWindow(snapshot: DataSnapshot, asOf: ISODate): { from: ISODate; to: ISODate; label: string } {
  const ht = snapshot.calendar.halfTerms.find((h) => h.start <= asOf && asOf <= h.end);
  if (ht) return { from: ht.start, to: asOf, label: ht.name };
  return { from: addDays(asOf, -42), to: asOf, label: 'the last six weeks' };
}
