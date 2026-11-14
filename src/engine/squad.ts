// The squad and the whole school. Whole-school runners (squad: false, e.g. every pupil in the Green Long
// Ducker) are kept so their names match and they count towards the field, but they are not squad members:
// no card, no boards, no page. Racing in two different events makes them squad members automatically.
import type { Athlete, DataSnapshot, Performance } from '../types';

/** Events raced: distinct events (or date + kind for results without one), deleted results ignored. */
export function eventsRaced(perfs: Performance[]): number {
  return new Set(perfs.filter((p) => !p.deleted).map((p) => p.eventId ?? `${p.date}|${p.kind}`)).size;
}

export function isSquad(a: Athlete, perfs: Performance[]): boolean {
  return a.squad !== false || eventsRaced(perfs) >= 2;
}

/** The data as the squad pages see it: whole-school runners (not yet promoted) and their records left out. */
export function squadView(s: DataSnapshot): DataSnapshot {
  if (!s.athletes.some((a) => a.squad === false)) return s;
  const byAthlete = new Map<string, Performance[]>();
  for (const p of s.performances) byAthlete.set(p.athleteId, [...(byAthlete.get(p.athleteId) ?? []), p]);
  const keep = new Set(s.athletes.filter((a) => isSquad(a, byAthlete.get(a.id) ?? [])).map((a) => a.id));
  return {
    ...s,
    athletes: s.athletes.filter((a) => keep.has(a.id)),
    performances: s.performances.filter((p) => keep.has(p.athleteId)),
    participation: s.participation.filter((p) => keep.has(p.athleteId)),
    achievements: s.achievements.filter((x) => keep.has(x.athleteId)),
  };
}
