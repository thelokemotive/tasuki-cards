import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DexieStore } from './dexieStore';
import { MemoryStore } from './memoryStore';
import { buildExport, canonicalSnapshot, mergeSnapshots, parseExport, ImportError } from './exportImport';
import { emptySnapshot } from './Store';
import { DEFAULT_CONFIG } from '../engine/config';
import type { DataSnapshot } from '../types';

function sample(): DataSnapshot {
  const s = emptySnapshot();
  s.athletes.push({
    id: 'a1',
    givenName: 'Aiko',
    familyName: 'Testfield',
    preferredName: 'Aiko',
    aliases: ['テストフィールド アイコ', 'Testfield Aiko'],
    sex: 'F',
    yearGroup: 'Y9',
    dob: '2012-05-04',
    displayMode: 'first_initial',
    absoluteBoardOptOut: false,
    avatar: { seed: 7, skinTone: 2, hairStyle: 3, hairColour: 1, kitColour: 'academy-navy', accessory: 'cap' },
    active: true,
  });
  s.courses.push({ id: 'c1', name: 'Campus Circuit', kind: 'circuit', distanceKm: 1.3, climbM: 0, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1 });
  s.events.push({ id: 'e1', name: 'Demo XC', date: '2026-11-29', kind: 'race', distanceKm: 4, official: true, fieldSize: 23, categoryWinners: [{ category: 'U15 Girls', timeSec: 901 }] });
  s.performances.push({
    id: 'p1',
    athleteId: 'a1',
    eventId: 'e1',
    date: '2026-11-29',
    kind: 'race',
    distanceKm: 4,
    timeSec: 975,
    place: 7,
    fieldSize: 23,
    verified: true,
    source: 'paste',
    rawInput: 'Aiko Testfield 16:15',
    history: [{ at: '2026-11-30T09:00:00.000Z', by: 'coach', before: { timeSec: 985 }, after: { timeSec: 975 }, reason: 'typo' }],
  });
  s.participation.push({ id: 'pa1', athleteId: 'a1', isoWeek: '2026-W45', type: 'saturday_run', date: '2026-11-07' });
  s.achievements.push({ id: 'm1', athleteId: 'a1', type: 'expedition', name: 'Demo Expedition 2026', date: '2026-06-01', icon: '🏔️' });
  s.configs.push(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, version: 2, note: 'anchor 0.82', runScore: { ...DEFAULT_CONFIG.runScore, anchorAG: 0.82 } });
  s.calendar = { holidayWeeks: ['2026-W52'], halfTerms: [{ id: 'ht1', name: 'Autumn 1', start: '2026-09-01', end: '2026-10-23' }] };
  s.meta = { lastBackupAt: '2026-11-01T00:00:00.000Z', coachName: 'Coach' };
  return s;
}

describe('DexieStore (IndexedDB)', () => {
  it('export → clear → import restores everything identically (acceptance test)', async () => {
    const store = new DexieStore('test-roundtrip');
    await store.open();
    const original = sample();
    await store.replaceAll(original);

    const before = await store.loadAll();
    expect(canonicalSnapshot(before)).toBe(canonicalSnapshot(original));

    const file = JSON.stringify(buildExport(before, '2026-12-01T00:00:00.000Z'));
    await store.clearAll();
    const empty = await store.loadAll();
    expect(empty.athletes).toHaveLength(0);
    expect(empty.performances).toHaveLength(0);

    await store.replaceAll(parseExport(file).snapshot);
    const after = await store.loadAll();
    expect(canonicalSnapshot(after)).toBe(canonicalSnapshot(before));
    store.close();
  });

  it('put and remove by key', async () => {
    const store = new DexieStore('test-put');
    await store.open();
    const s = sample();
    await store.put('athletes', s.athletes);
    await store.put('athletes', [{ ...s.athletes[0], preferredName: 'Ai' }]);
    let all = await store.loadAll();
    expect(all.athletes).toHaveLength(1);
    expect(all.athletes[0].preferredName).toBe('Ai');
    await store.remove('athletes', ['a1']);
    all = await store.loadAll();
    expect(all.athletes).toHaveLength(0);
    store.close();
  });
});

describe('MemoryStore', () => {
  it('round-trips a snapshot', async () => {
    const m = new MemoryStore();
    await m.replaceAll(sample());
    expect(canonicalSnapshot(await m.loadAll())).toBe(canonicalSnapshot(sample()));
  });
});

describe('import validation and merge', () => {
  it('rejects non-backups with a readable message', () => {
    expect(() => parseExport('not json')).toThrow(ImportError);
    expect(() => parseExport('{"hello":1}')).toThrow(/not a Tasuki Cards backup/);
  });

  it('merge adds new ids, imported record wins on the same id, calendar is unioned', () => {
    const cur = sample();
    const inc = sample();
    inc.performances[0] = { ...inc.performances[0], timeSec: 970 };
    inc.performances.push({ ...inc.performances[0], id: 'p2', timeSec: 990 });
    inc.calendar = { holidayWeeks: ['2027-W01'], halfTerms: [] };
    const { merged, summary } = mergeSnapshots(cur, inc);
    expect(merged.performances).toHaveLength(2);
    expect(merged.performances.find((p) => p.id === 'p1')?.timeSec).toBe(970);
    expect(summary.added.performances).toBe(1);
    expect(summary.updated.performances).toBe(1);
    expect(merged.calendar.holidayWeeks).toEqual(['2026-W52', '2027-W01']);
    expect(merged.calendar.halfTerms).toHaveLength(1);
  });
});
