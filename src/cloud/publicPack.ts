// The view-only copy of the squad that every @harrowappi.jp account can read (pupils and staff who are
// not coaches). Coaches' devices build it from the full data and publish it; it holds only what is already
// public on cards, boards and the projector:
// - nothing identifying for runners whose family opted out ("Hidden runner", no card)
// - names as each runner's display setting shows them (full, first name + initial, or alias); no aliases
// - no dates of birth, no coach notes, no raw pasted text, no correction history
// - no winter soreness, pain flags or session notes (health information stays with the coach)
// - ratings computed by the coach from the full data (so they match the printed cards), with every age
//   rounded down to whole years.
import type { Athlete, DataSnapshot, Participation, Performance } from '../types';
import type { WinterSummary } from '../engine/winter';
import type { AthleteDerived, Derived } from '../engine/derive';
import { displayName } from '../engine/display';

export interface PublicData {
  snapshot: DataSnapshot;
  derived: Derived;
}

export const HIDDEN_NAME = 'Hidden runner';

function publicAthlete(a: Athlete): Athlete {
  const name = a.hiddenOnline ? HIDDEN_NAME : displayName(a);
  return { ...a, givenName: name, familyName: '', preferredName: name, displayMode: 'full', publicAlias: undefined, aliases: [], dob: undefined, notes: undefined };
}

function publicPerf(p: Performance): Performance {
  return { ...p, rawInput: '', history: [] };
}

/**
 * JSON text of the public copy. Maps are kept. A runner whose family opted out is left out altogether: no
 * card, no results, no place on any board. Nothing in it gives away a birthday: every `age` is rounded down to
 * whole years, and the figures worked out from the exact age (the standard time and the age grade behind a
 * score, and the working of the 5 km prediction) are rounded so the age cannot be worked back from them.
 */
/** Winter top-ups without soreness, where it hurts, or notes: how a pupil feels is health information, for the coach only. */
function publicParticipation(p: Participation): Participation {
  if (!p.topUp) return p;
  const { soreness: _s, soreWhere: _w, note: _n, ...topUp } = p.topUp;
  return { ...p, topUp };
}

/** Winter summary without the soreness and pain nudges (and a next step that might mention them). */
function publicWinter(w: WinterSummary | undefined): WinterSummary | undefined {
  if (!w) return w;
  const health = w.flags.some((f) => f.kind === 'soreness' || f.kind === 'pain' || f.kind === 'volume' || f.kind === 'growth');
  return { ...w, flags: w.flags.filter((f) => f.kind === 'return' || f.kind === 'spike'), next: health ? '' : w.next };
}

export function makePublicPack(snapshot: DataSnapshot, derived: Derived): string {
  const keep = new Set(snapshot.athletes.filter((a) => !a.hiddenOnline).map((a) => a.id));
  const athletes = new Map<string, AthleteDerived>();
  for (const [id, d] of derived.athletes) {
    if (!keep.has(id)) continue;
    athletes.set(id, { ...d, athlete: publicAthlete(d.athlete), perfs: d.perfs.filter((p) => !p.deleted).map(publicPerf), winter: publicWinter(d.winter) });
  }
  const pub: PublicData = {
    snapshot: {
      ...snapshot,
      athletes: snapshot.athletes.filter((a) => keep.has(a.id)).map(publicAthlete),
      performances: snapshot.performances.filter((p) => keep.has(p.athleteId) && !p.deleted).map(publicPerf),
      participation: snapshot.participation.filter((p) => keep.has(p.athleteId)).map(publicParticipation),
      achievements: snapshot.achievements.filter((x) => keep.has(x.athleteId)),
      meta: { coachName: snapshot.meta.coachName },
    },
    derived: {
      ...derived,
      athletes,
      surges: derived.surges.filter((x) => keep.has(x.athleteId)),
      courseRecords: derived.courseRecords.filter((x) => keep.has(x.athleteId)),
    },
  };
  const to = (x: number, step: number) => Math.round(x / step) * step;
  return JSON.stringify(pub, (key, value) => {
    if (value instanceof Map) return { __map: [...value.entries()] };
    if (typeof value !== 'number') return value;
    if (key === 'age') return Math.floor(value);
    if (key === 'standardSec') return to(value, 5);
    if (key === 'ageGrade') return Number(value.toFixed(2));
    if (key === 'exponent') return Number(value.toFixed(2));
    if (key === 'growthPct') return Number(value.toFixed(0));
    if (key === 'fiveKThen' || key === 'fiveKNow') return to(value, 5);
    return value;
  });
}

export function readPublicPack(json: string): PublicData {
  return JSON.parse(json, (_key, value) => (value && typeof value === 'object' && Array.isArray(value.__map) ? new Map(value.__map) : value)) as PublicData;
}
