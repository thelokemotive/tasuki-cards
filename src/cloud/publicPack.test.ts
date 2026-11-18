import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { DEFAULT_CONFIG } from '../engine/config';
import { deriveAll } from '../engine/derive';
import { makePublicPack, readPublicPack } from './publicPack';

describe('the view-only copy for pupils', () => {
  const s0 = { ...emptySnapshot(), ...buildDemoData('2026-11-13'), configs: [DEFAULT_CONFIG] };
  const snap = { ...s0, athletes: s0.athletes.map((a, i) => (i === 0 ? { ...a, dob: '2013-05-17', notes: 'asthma inhaler', aliases: ['Secret'], schoolAccounts: ['secret.pupil@harrowappi.jp'], displayMode: 'alias' as const, publicAlias: 'Rocket' } : a)) };
  const derived = deriveAll(snap, '2026-11-13', DEFAULT_CONFIG);
  const json = makePublicPack(snap, derived);
  const pub = readPublicPack(json);

  it('leaves out dates of birth, notes, aliases, real names behind an alias, pasted text and history', () => {
    for (const bad of [/2013-05-17/, /asthma/, /Secret/, /secret\.pupil/, /schoolAccounts/, /rawInput":"[^"]/, /"dob"/]) expect(json.match(bad)?.[0] ?? '', String(bad) + ' ' + json.slice(Math.max(0, (json.match(bad)?.index ?? 0) - 120), (json.match(bad)?.index ?? 0) + 60)).toBe('');
    expect(pub.snapshot.athletes.some((x) => x.notes || x.dob)).toBe(false);
    expect(pub.snapshot.athletes.some((x) => x.notes || x.dob)).toBe(false);
    const a = snap.athletes[0];
    expect(json).not.toContain(`"${a.givenName}"`);
    expect(pub.snapshot.athletes[0].preferredName).toBe('Rocket');
    expect(json).not.toMatch(/"age":\d+\.\d/);
  });

  it('a runner hidden online is left out altogether: no card, no results, no board rows', () => {
    const hidden = snap.athletes[1];
    const s2 = { ...snap, athletes: snap.athletes.map((a, i) => (i === 1 ? { ...a, hiddenOnline: true } : a)) };
    const j = makePublicPack(s2, deriveAll(s2, '2026-11-13', DEFAULT_CONFIG));
    const p2 = readPublicPack(j);
    expect(j).not.toContain(`"${hidden.givenName}"`);
    expect(j).not.toContain(hidden.id);
    expect(p2.snapshot.athletes).toHaveLength(snap.athletes.length - 1);
    expect(p2.derived.athletes.has(hidden.id)).toBe(false);
    expect(p2.snapshot.performances.some((x) => x.athleteId === hidden.id)).toBe(false);
  });

  it('an exact age cannot be worked back from the figures behind a score', () => {
    // The standard time is interpolated on the exact age, so to the hundredth of a second it gives the birthday.
    const exact = [...derived.athletes.values()].flatMap((d) => d.ratings.perfScores).filter((x) => x.standardSec != null);
    expect(exact.some((x) => !Number.isInteger(x.standardSec))).toBe(true);
    for (const d of pub.derived.athletes.values()) {
      for (const x of d.ratings.perfScores) {
        if (x.standardSec != null) expect(x.standardSec % 5).toBe(0);
        if (x.ageGrade != null) expect(Number(x.ageGrade.toFixed(2))).toBe(x.ageGrade);
        expect(Number.isInteger(x.age)).toBe(true);
      }
      for (const s of d.prediction?.sources ?? []) expect(Number.isInteger(s.age) && s.fiveKNow % 5 === 0).toBe(true);
    }
  });

  it('keeps the ratings exactly as the coach sees them', () => {
    for (const [id, d] of derived.athletes) {
      const p = pub.derived.athletes.get(id)!;
      expect(p.ratings.ovr).toEqual(d.ratings.ovr);
      expect(p.badges.length).toBe(d.badges.length);
    }
    expect(pub.derived.lookup.courses.size).toBe(derived.lookup.courses.size);
  });

  it('winter top-ups go out without soreness, notes or pain flags', () => {
    const a = snap.athletes[0];
    const s3 = {
      ...snap,
      calendar: { ...snap.calendar, winter: [{ id: 'w', name: 'Autumn top-up', start: '2026-11-09', end: '2026-11-15', kind: 'holiday' as const }] },
      participation: [
        ...snap.participation,
        { id: 'tu1', athleteId: a.id, isoWeek: '2026-W46', type: 'top_up' as const, date: '2026-11-12', topUp: { activity: 'run' as const, minutes: 25, soreness: 7, note: 'knee hurts on stairs' } },
      ],
    };
    const d3 = deriveAll(s3, '2026-11-13', DEFAULT_CONFIG);
    expect(d3.athletes.get(a.id)?.winter?.flags.some((f) => f.kind === 'pain')).toBe(true);
    const j = makePublicPack(s3, d3);
    expect(j).not.toContain('knee hurts');
    expect(j).not.toContain('"soreness"');
    expect(j).not.toMatch(/Soreness \d/);
    expect(readPublicPack(j).snapshot.participation.find((p) => p.id === 'tu1')?.topUp?.minutes).toBe(25);
  });
});
