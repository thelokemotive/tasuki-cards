// The view-only copy of the squad that every @harrowappi.jp account can read (pupils and staff who are
// not coaches). Coaches' devices build it from the full data and publish it; it holds only what is already
// public on cards, boards and the projector:
// - names as each runner's display setting shows them (full, first name + initial, or alias); no aliases
// - no dates of birth, no coach notes, no raw pasted text, no correction history
// - ratings computed by the coach from the full data (so they match the printed cards), with every age
//   rounded down to whole years.
import type { Athlete, DataSnapshot, Performance } from '../types';
import type { AthleteDerived, Derived } from '../engine/derive';
import { displayName } from '../engine/display';

export interface PublicData {
  snapshot: DataSnapshot;
  derived: Derived;
}

function publicAthlete(a: Athlete): Athlete {
  const name = displayName(a);
  return { ...a, givenName: name, familyName: '', preferredName: name, displayMode: 'full', publicAlias: undefined, aliases: [], dob: undefined, notes: undefined };
}

function publicPerf(p: Performance): Performance {
  return { ...p, rawInput: '', history: [] };
}

/** JSON text of the public copy. Maps are kept; every numeric `age` is rounded down. */
export function makePublicPack(snapshot: DataSnapshot, derived: Derived): string {
  const keep = new Set(snapshot.athletes.map((a) => a.id));
  const athletes = new Map<string, AthleteDerived>();
  for (const [id, d] of derived.athletes) {
    if (!keep.has(id)) continue;
    athletes.set(id, { ...d, athlete: publicAthlete(d.athlete), perfs: d.perfs.filter((p) => !p.deleted).map(publicPerf) });
  }
  const pub: PublicData = {
    snapshot: {
      ...snapshot,
      athletes: snapshot.athletes.filter((a) => keep.has(a.id)).map(publicAthlete),
      performances: snapshot.performances.filter((p) => keep.has(p.athleteId) && !p.deleted).map(publicPerf),
      
      meta: { coachName: snapshot.meta.coachName },
    },
    derived: {
      ...derived,
      athletes,
    },
  };
  return JSON.stringify(pub, (key, value) => {
    if (value instanceof Map) return { __map: [...value.entries()] };
    if (key === 'age' && typeof value === 'number') return Math.floor(value);
    return value;
  });
}

export function readPublicPack(json: string): PublicData {
  return JSON.parse(json, (_key, value) => (value && typeof value === 'object' && Array.isArray(value.__map) ? new Map(value.__map) : value)) as PublicData;
}
