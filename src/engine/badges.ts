// Derived badges (spec 3.13). Racing more earns caps and badges, never rating points.
// Nothing here is stored except the manual achievements passed in (expeditions and custom badges).
import type { Athlete, ISODate, ManualAchievement, Performance, PerfKind } from '../types';
import type { Config } from './config';
import type { Badge, BadgeKind, CourseRecord, StreakResult, SurgeResult } from './types';
import { ARM_DOMAINS, armLevelsFromTest, type ArmDomain } from './arm';
import { weekMonday } from './dates';
import { byDate, counts, isRaceCap, resolveContext, TIMED_KINDS, type Lookup } from './perf';

/** Order badges are listed in (the spec's order); the card row re-sorts by prestige. */
const KIND_ORDER: BadgeKind[] = ['caps', 'parkrun', 'distance', 'mountain', 'streak', 'arm', 'surge', 'record', 'expedition', 'custom'];

const ARM_LABEL: Record<ArmDomain, string> = { ankle: 'Ankle', calf: 'Calf', balance: 'Balance' };

const BAND_LABEL: Record<CourseRecord['band'], string> = { 'Y7-8': 'Y7–8', 'Y9-11': 'Y9–11', 'Y12-13': 'Y12–13', Staff: 'Staff' };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 1000 → '1,000' (fixed, so labels do not depend on the browser locale). */
function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isRun(p: Performance): boolean {
  return (TIMED_KINDS as readonly PerfKind[]).includes(p.kind);
}

/** 'Y9–11 girls', 'Y12–13 boys', 'Staff women', 'Staff men'. */
function recordGroupLabel(r: CourseRecord): string {
  if (r.band === 'Staff') return `Staff ${r.sex === 'F' ? 'women' : 'men'}`;
  return `${BAND_LABEL[r.band]} ${r.sex === 'F' ? 'girls' : 'boys'}`;
}

/**
 * Every badge the athlete holds as of `asOf`, in the spec's order:
 * race caps ★ (count), parkrun counter, distance badges (first counted run with distanceKm ≥ each
 * config.badges.distances entry; ultra = distanceKm > config.badges.ultraKm), Mountain (a counted run with
 * climb ≥ config.badges.mountainClimbM), streak milestones reached by bestStreak, ARM (each domain's highest
 * level ever reached, e.g. 'Ankle L3'), Tasuki Surge bronze/gold (one per medal), course records currently
 * held, and manual expedition/custom achievements dated on or before asOf.
 */
export function computeBadges(input: {
  athlete: Athlete;
  perfs: Performance[];
  lookup: Lookup;
  config: Config;
  asOf: ISODate;
  streak: StreakResult;
  surges: SurgeResult[];
  courseRecords: CourseRecord[];
  achievements: ManualAchievement[];
}): Badge[] {
  const { athlete, lookup, config, asOf } = input;
  const mine = input.perfs.filter((p) => p.athleteId === athlete.id && counts(p) && p.date <= asOf).sort(byDate);
  const badges: Badge[] = [];

  const caps = mine.filter(isRaceCap);
  if (caps.length) {
    const last = caps[caps.length - 1];
    badges.push({ key: 'caps', kind: 'caps', label: plural(caps.length, 'race cap', 'race caps'), icon: '★', count: caps.length, date: last.date, perfId: last.id });
  }

  const parkruns = mine.filter((p) => p.kind === 'parkrun');
  if (parkruns.length) {
    const last = parkruns[parkruns.length - 1];
    badges.push({ key: 'parkrun', kind: 'parkrun', label: plural(parkruns.length, 'parkrun', 'parkruns'), icon: '🌳', count: parkruns.length, date: last.date, perfId: last.id });
  }

  const runs = mine.filter(isRun).map((p) => ({ p, ctx: resolveContext(p, lookup) }));
  for (const d of [...config.badges.distances].sort((a, b) => a.km - b.km)) {
    const first = runs.find((r) => r.ctx.distanceKm != null && r.ctx.distanceKm >= d.km);
    if (first) badges.push({ key: `distance-${d.key}`, kind: 'distance', label: d.label, icon: '🏁', date: first.p.date, perfId: first.p.id });
  }
  const ultra = runs.find((r) => r.ctx.distanceKm != null && r.ctx.distanceKm > config.badges.ultraKm);
  if (ultra) badges.push({ key: 'distance-ultra', kind: 'distance', label: 'First ultra', icon: '🦅', date: ultra.p.date, perfId: ultra.p.id });

  const mountain = runs.find((r) => r.ctx.climbM >= config.badges.mountainClimbM);
  if (mountain) {
    badges.push({ key: 'mountain', kind: 'mountain', label: `Mountain (${thousands(config.badges.mountainClimbM)} m+ climb)`, icon: '⛰️', date: mountain.p.date, perfId: mountain.p.id });
  }

  // Streak milestones: replay the weeks to date each milestone (holiday/frozen/current weeks hold the run).
  const reachedAt = new Map<number, ISODate>();
  let run = 0;
  for (const w of input.streak.weeks) {
    if (w.state === 'missed') run = 0;
    if (w.state !== 'counted') continue;
    run++;
    if (!reachedAt.has(run)) reachedAt.set(run, weekMonday(w.week));
  }
  for (const m of [...config.streak.milestones].sort((a, b) => a - b)) {
    if (input.streak.bestStreak >= m) badges.push({ key: `streak-${m}`, kind: 'streak', label: `${m}-week streak`, icon: '🔥', date: reachedAt.get(m), count: m });
  }

  const armBest = new Map<ArmDomain, { level: number; p: Performance }>();
  for (const p of mine.filter((q) => q.kind === 'arm')) {
    const levels = armLevelsFromTest(p.arm, config);
    for (const d of ARM_DOMAINS) {
      const level = levels[d];
      if (level != null && level >= 1 && level > (armBest.get(d)?.level ?? 0)) armBest.set(d, { level, p });
    }
  }
  for (const d of ARM_DOMAINS) {
    const b = armBest.get(d);
    if (b) badges.push({ key: `arm-${d}`, kind: 'arm', label: `${ARM_LABEL[d]} L${b.level}`, icon: '🛡️', date: b.p.date, perfId: b.p.id, count: b.level });
  }

  const perfById = new Map(mine.map((p) => [p.id, p]));
  for (const s of input.surges) {
    const p = perfById.get(s.perfId);
    if (s.athleteId !== athlete.id || !s.medal || !p) continue;
    const eventName = s.eventId ? lookup.events.get(s.eventId)?.name : undefined;
    badges.push({
      key: `surge:${s.perfId}`,
      kind: 'surge',
      label: `Tasuki Surge ${s.medal}${eventName ? ` · ${eventName}` : ''}`,
      icon: '⚡',
      date: p.date,
      perfId: p.id,
      tier: s.medal,
    });
  }

  for (const r of input.courseRecords) {
    if (r.athleteId !== athlete.id) continue;
    const course = lookup.courses.get(r.courseId)?.name ?? 'Course';
    badges.push({ key: `record:${r.courseId}:${r.sex}:${r.band}`, kind: 'record', label: `${course} record · ${recordGroupLabel(r)}`, icon: '🏆', date: r.date, perfId: r.perfId });
  }

  for (const a of [...input.achievements].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))) {
    if (a.athleteId !== athlete.id || a.date > asOf) continue;
    badges.push({ key: `${a.type}:${a.id}`, kind: a.type, label: a.name, icon: a.icon, date: a.date });
  }

  return badges.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/**
 * Prestige for the card's badge row (higher first): course record 100, Surge gold 90, expedition 80,
 * Mountain 75, Surge bronze 65, custom 60, streak 50 + weeks, caps 40 + count (max 20),
 * ARM 30 + 4 × level, parkruns 30 + count (max 10), distance 35 + 15 per step up the ladder.
 * `distanceStep` is the badge's position among the distance badges as computeBadges lists them
 * (up the config.badges.distances ladder, then ultra), so first 5K < 10K < half < marathon < ultra.
 */
function prestige(b: Badge, distanceStep: number): number {
  switch (b.kind) {
    case 'record':
      return 100;
    case 'surge':
      return b.tier === 'gold' ? 90 : 65;
    case 'expedition':
      return 80;
    case 'mountain':
      return 75;
    case 'custom':
      return 60;
    case 'streak':
      return 50 + (b.count ?? 0);
    case 'caps':
      return 40 + Math.min(b.count ?? 0, 20);
    case 'arm':
      return 30 + 4 * (b.count ?? 0);
    case 'parkrun':
      return 30 + Math.min(b.count ?? 0, 10);
    case 'distance':
      return 35 + 15 * distanceStep;
  }
}

/**
 * Up to n badges (default 5) for the card, most prestigious first. The row first takes the best badge
 * of each kind (so a 20-week streak shows instead of four streak flames), then fills any spare places
 * with the next most prestigious. Ties: most recent first, then key.
 */
export function badgeRow(badges: Badge[], n = 5): Badge[] {
  const distance = badges.filter((b) => b.kind === 'distance');
  const score = new Map(badges.map((b) => [b, prestige(b, Math.max(0, distance.indexOf(b)))]));
  const ranked = [...badges].sort(
    (a, b) =>
      (score.get(b) as number) - (score.get(a) as number) ||
      ((b.date ?? '') < (a.date ?? '') ? -1 : (b.date ?? '') > (a.date ?? '') ? 1 : 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const picked = new Set<Badge>();
  const kinds = new Set<BadgeKind>();
  for (const b of ranked) {
    if (picked.size >= n) break;
    if (kinds.has(b.kind)) continue;
    kinds.add(b.kind);
    picked.add(b);
  }
  for (const b of ranked) {
    if (picked.size >= n) break;
    picked.add(b);
  }
  return ranked.filter((b) => picked.has(b));
}
