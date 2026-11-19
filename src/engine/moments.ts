// What is new for a runner since they last looked: the moments the pupil's app reveals one at a time (a
// tier reached, a spirit awakened, a stat up, a PB, a badge, a week kept). The phone keeps a small summary
// of what it last showed (SeenState) and compares. Only good news is revealed: a stat that dips (freshness,
// a result corrected) updates quietly, and nothing is ever framed as a loss.
import type { ISODate } from '../types';
import type { AthleteDerived } from './derive';
import type { RatingKey, Tier } from './types';
import { STAT_KEYS } from './types';
import { formatTime } from './format';
import { CAMPS, TIER_ORDER } from './coach';
import { STAT_LONG, STAT_SPIRIT, type SpiritId } from './spirits';

export interface SeenState {
  v: 1;
  asOf: ISODate;
  ovr?: number;
  tier: Tier;
  /** Unlocked stats and RACE: value; locked: absent. */
  stats: Partial<Record<RatingKey, number>>;
  streak: number;
  /** Every week the streak has counted, ever. */
  keptWeeks: number;
  badges: string[];
  /** PB key → value (time in seconds, or count). */
  pbs: Record<string, number>;
}

export function seenState(d: AthleteDerived): SeenState {
  const r = d.ratings;
  const stats: Partial<Record<RatingKey, number>> = {};
  for (const k of STAT_KEYS) if (!r.stats[k].locked && r.stats[k].value != null) stats[k] = r.stats[k].value;
  if (!r.race.locked && r.race.value != null) stats.RACE = r.race.value;
  return {
    v: 1,
    asOf: r.asOf,
    ovr: Number.isFinite(Number(r.ovr.display)) ? Number(r.ovr.display) : undefined,
    tier: r.tier,
    stats,
    streak: d.streak.currentStreak,
    keptWeeks: d.streak.weeks.filter((w) => w.state === 'counted').length,
    badges: d.badges.map((b) => b.key),
    pbs: Object.fromEntries(d.pbs.map((p) => [p.key, p.value])),
  };
}

export type MomentKind = 'tier' | 'awaken' | 'stat' | 'ovr' | 'pb' | 'badge' | 'week';

export interface Moment {
  kind: MomentKind;
  title: string;
  detail: string;
  spirit: SpiritId;
  /** A big moment gets the full celebration (tier, awakening, milestone). */
  big: boolean;
  /** Badge icon or stat key, for the picture. */
  icon?: string;
  stat?: RatingKey;
}

const KIND_ORDER: MomentKind[] = ['tier', 'awaken', 'week', 'stat', 'ovr', 'pb', 'badge'];

function isUp(a: Tier, b: Tier): boolean {
  return TIER_ORDER.indexOf(b) > TIER_ORDER.indexOf(a);
}

/**
 * Good news since `prev`, most important first, at most `max`. No `prev` (first visit on this phone):
 * nothing, so a pupil is not flooded with a whole season at once.
 */
export function momentsSince(prev: SeenState | undefined, d: AthleteDerived, max = 8): Moment[] {
  if (!prev || prev.v !== 1) return [];
  const now = seenState(d);
  const out: Moment[] = [];

  if (isUp(prev.tier, now.tier)) {
    const camp = CAMPS[now.tier];
    out.push({ kind: 'tier', title: `${now.tier[0].toUpperCase()}${now.tier.slice(1)}!`, detail: `You have reached ${camp.name} (${camp.jp}). ${camp.blurb}`, spirit: 'serow', big: true });
  }

  for (const k of [...STAT_KEYS, 'RACE'] as RatingKey[]) {
    const before = prev.stats[k];
    const after = now.stats[k];
    if (after == null) continue;
    if (before == null) out.push({ kind: 'awaken', title: `${STAT_LONG[k]} awakened`, detail: `Your ${k} spirit, the ${spiritName(STAT_SPIRIT[k])}, joins your trail at ${after}.`, spirit: STAT_SPIRIT[k], big: true, stat: k });
    else if (after > before) out.push({ kind: 'stat', title: `${k} ${before} → ${after}`, detail: `${STAT_LONG[k]} up ${after - before}.`, spirit: STAT_SPIRIT[k], big: false, stat: k });
  }

  if (prev.ovr != null && now.ovr != null && now.ovr > prev.ovr) out.push({ kind: 'ovr', title: `OVR ${prev.ovr} → ${now.ovr}`, detail: 'Your card has levelled up.', spirit: 'serow', big: false });

  for (const pb of d.pbs) {
    const before = prev.pbs[pb.key];
    const better = before == null ? false : pb.measure === 'time' ? pb.value < before : pb.value > before;
    if (!better) continue;
    const gain = pb.measure === 'time' ? `${Math.round(before! - pb.value)} s faster` : `${+(pb.value - before!).toFixed(1)} more`;
    out.push({ kind: 'pb', title: `New PB: ${pb.label}`, detail: `${pb.measure === 'time' ? formatTime(pb.value) : pb.value}, ${gain}.`, spirit: 'falcon', big: false, icon: '⏱' });
  }

  const had = new Set(prev.badges);
  for (const b of d.badges) {
    if (had.has(b.key)) continue;
    const milestone = b.kind === 'streak';
    out.push({ kind: milestone ? 'week' : 'badge', title: milestone ? `${b.count}-week trail!` : b.label, detail: milestone ? 'A streak milestone: this badge is yours for good.' : 'A new badge for your collection.', spirit: milestone ? 'serow' : badgeSpirit(b.kind), big: milestone, icon: b.icon });
  }

  if (now.keptWeeks > prev.keptWeeks && !out.some((m) => m.kind === 'week')) {
    out.push({ kind: 'week', title: now.streak > 1 ? `Week kept: ${now.streak} in a row` : 'Week kept', detail: now.streak > 1 ? 'Your trail grows. Steady weeks are what build a runner.' : 'A new trail begins.', spirit: 'serow', big: false, icon: '🔥' });
  }

  return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)).slice(0, max);
}

function spiritName(id: SpiritId): string {
  const names: Record<SpiritId, string> = { falcon: 'peregrine falcon', eagle: "Steller's sea eagle", serow: 'serow', pika: 'pika', owl: 'fish owl', panda: 'red panda', monkey: 'snow monkey', dugong: 'dugong', rabbit: 'Amami rabbit' };
  return names[id];
}

function badgeSpirit(kind: string): SpiritId {
  switch (kind) {
    case 'arm':
      return 'panda';
    case 'caps':
    case 'surge':
      return 'monkey';
    case 'mountain':
      return 'serow';
    case 'distance':
    case 'treadmill':
    case 'parkrun':
      return 'eagle';
    case 'record':
      return 'falcon';
    default:
      return 'serow';
  }
}
