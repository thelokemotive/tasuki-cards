import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { DEFAULT_CONFIG } from '../engine/config';
import { deriveAll } from '../engine/derive';
import { makePublicPack, readPublicPack } from './publicPack';

describe('the view-only copy for pupils', () => {
  const s0 = { ...emptySnapshot(), ...buildDemoData('2026-11-13'), configs: [DEFAULT_CONFIG] };
  const snap = { ...s0, athletes: s0.athletes.map((a, i) => (i === 0 ? { ...a, dob: '2013-05-17', notes: 'asthma inhaler', aliases: ['Secret'], displayMode: 'alias' as const, publicAlias: 'Rocket' } : a)) };
  const derived = deriveAll(snap, '2026-11-13', DEFAULT_CONFIG);
  const json = makePublicPack(snap, derived);
  const pub = readPublicPack(json);

  it('leaves out dates of birth, notes, aliases, real names behind an alias, pasted text and history', () => {
    for (const bad of [/2013-05-17/, /asthma/, /Secret/, /rawInput":"[^"]/, /"dob"/]) expect(json.match(bad)?.[0] ?? '', String(bad) + ' ' + json.slice(Math.max(0, (json.match(bad)?.index ?? 0) - 120), (json.match(bad)?.index ?? 0) + 60)).toBe('');
    expect(pub.snapshot.athletes.some((x) => x.notes || x.dob)).toBe(false);
    expect(pub.snapshot.athletes.some((x) => x.notes || x.dob)).toBe(false);
    const a = snap.athletes[0];
    expect(json).not.toContain(`"${a.givenName}"`);
    expect(pub.snapshot.athletes[0].preferredName).toBe('Rocket');
    expect(json).not.toMatch(/"age":\d+\.\d/);
  });

  it('a runner hidden online appears only as "Hidden runner"', () => {
    const s2 = { ...snap, athletes: snap.athletes.map((a, i) => (i === 1 ? { ...a, hiddenOnline: true } : a)) };
    const j = makePublicPack(s2, deriveAll(s2, '2026-11-13', DEFAULT_CONFIG));
    expect(j).not.toContain(`"${snap.athletes[1].givenName}"`);
    expect(readPublicPack(j).snapshot.athletes[1].preferredName).toBe('Hidden runner');
  });

  it('keeps the ratings exactly as the coach sees them', () => {
    for (const [id, d] of derived.athletes) {
      const p = pub.derived.athletes.get(id)!;
      expect(p.ratings.ovr).toEqual(d.ratings.ovr);
      expect(p.badges.length).toBe(d.badges.length);
    }
    expect(pub.derived.lookup.courses.size).toBe(derived.lookup.courses.size);
  });
});
