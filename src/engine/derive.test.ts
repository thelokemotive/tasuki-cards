// End-to-end engine tests: demo data → deriveAll → boards, plus corrections flowing through.
import { describe, expect, it } from 'vitest';
import type { DataSnapshot, Performance } from '../types';
import { SCHEMA_VERSION } from '../types';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import { deriveAll, diffRatings } from './derive';
import { BOARD_IDS, buildBoard, PRIVATE_RECORD_HOLDER } from './boards';
import { correctPerformance, deletePerformance } from './corrections';
import { STAT_KEYS } from './types';
import { buildDemoData, DEMO_ATHLETE_NAMES, isDemoRecord, seedCourses, withoutDemoData, CAMPUS_CIRCUIT_ID } from '../demo/demoData';

const TODAY = '2026-10-22';

function demoSnapshot(): DataSnapshot {
  const demo = buildDemoData(TODAY);
  return {
    schemaVersion: SCHEMA_VERSION,
    ...demo,
    courses: [...seedCourses(), ...demo.courses],
    configs: [DEFAULT_CONFIG],
    meta: { demoLoaded: true },
  };
}

describe('demo data (spec 0, 11)', () => {
  const s = demoSnapshot();

  it('is deterministic', () => {
    expect(JSON.stringify(buildDemoData(TODAY))).toBe(JSON.stringify(buildDemoData(TODAY)));
  });

  it('every record is demo-flagged and every name is on the invented-name list', () => {
    for (const t of ['athletes', 'events', 'performances', 'participation', 'achievements'] as const) {
      for (const r of s[t] as { demo?: boolean }[]) expect(isDemoRecord(r)).toBe(true);
    }
    for (const a of s.athletes) expect(DEMO_ATHLETE_NAMES).toContain(`${a.givenName} ${a.familyName}`);
  });

  it('"Clear all demo data" leaves an empty app (only the seeded Campus Circuit)', () => {
    const cleared = withoutDemoData(s);
    expect(cleared.athletes).toEqual([]);
    expect(cleared.performances).toEqual([]);
    expect(cleared.events).toEqual([]);
    expect(cleared.participation).toEqual([]);
    expect(cleared.achievements).toEqual([]);
    expect(cleared.courses.map((c) => c.id)).toEqual([CAMPUS_CIRCUIT_ID]);
    const d = deriveAll(cleared, TODAY);
    expect(d.athletes.size).toBe(0);
    for (const id of BOARD_IDS) expect(buildBoard(id, d).groups.every((g) => g.rows.length === 0)).toBe(true);
  });

  it('exercises the whole engine: unlocked and locked stats, In-Form, streaks, Surge medals, badges', () => {
    const d = deriveAll(s, TODAY);
    const all = [...d.athletes.values()];
    expect(all.some((a) => !a.ratings.stats.SPD.locked)).toBe(true);
    expect(all.some((a) => STAT_KEYS.some((k) => a.ratings.stats[k].locked))).toBe(true);
    expect(all.some((a) => a.inForm.length > 0)).toBe(true);
    expect(all.some((a) => a.streak.currentStreak >= 4)).toBe(true);
    expect(d.surges.some((x) => x.medal)).toBe(true);
    expect(all.some((a) => a.badges.length >= 3)).toBe(true);
    expect(all.every((a) => a.badgeRow.length <= 5)).toBe(true);
  });
});

describe('locked stats never produce a number (spec 3.9, 11)', () => {
  it('on ratings and on every board', () => {
    const d = deriveAll(demoSnapshot(), TODAY);
    for (const a of d.athletes.values()) {
      for (const k of STAT_KEYS) {
        const st = a.ratings.stats[k];
        if (st.locked) {
          expect(st.value).toBeUndefined();
          expect(st.unlockHint).toBeTruthy();
          expect(st.unlockHint!.split(/\s+/).length).toBeLessThanOrEqual(3);
        }
      }
      if (a.ratings.race.locked) expect(a.ratings.race.value).toBeUndefined();
      if (a.ratings.ovr.unlocked < 2) expect(a.ratings.ovr.display).toBe('—');
    }
    const race = buildBoard('race', d, { full: true });
    for (const row of race.groups.flatMap((g) => g.rows)) expect(d.athletes.get(row.athleteId)!.ratings.race.locked).toBe(false);
  });
});

describe('boards (spec 6)', () => {
  const s = demoSnapshot();
  const d = deriveAll(s, TODAY);

  it('absolute boards exclude opted-out and inactive athletes and show the top 10', () => {
    const hidden = new Set(s.athletes.filter((a) => a.absoluteBoardOptOut || !a.active).map((a) => a.id));
    expect(hidden.size).toBeGreaterThan(0);
    for (const id of ['race', 'caps', 'end', 'spd'] as const) {
      const b = buildBoard(id, d);
      expect(b.absolute).toBe(true);
      for (const g of b.groups) {
        expect(g.rows.length).toBeLessThanOrEqual(DEFAULT_CONFIG.boards.topN);
        for (const r of g.rows) expect(hidden.has(r.athleteId)).toBe(false);
      }
    }
  });

  it('In-Form and Streak boards include opted-out athletes', () => {
    const optOut = s.athletes.find((a) => a.absoluteBoardOptOut && a.active)!;
    const ad = d.athletes.get(optOut.id)!;
    const streak = buildBoard('streak', d);
    if (ad.streak.currentStreak >= 2) expect(streak.groups.flatMap((g) => g.rows).some((r) => r.athleteId === optOut.id)).toBe(true);
    expect(streak.absolute).toBe(false);
    expect(buildBoard('inform', d).absolute).toBe(false);
  });

  it('names follow displayMode and never include DOB', () => {
    for (const id of BOARD_IDS) {
      for (const r of buildBoard(id, d, { full: true }).groups.flatMap((g) => g.rows)) {
        expect(r.name).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        if (r.athleteId.startsWith('house:')) continue; // house cup rows are houses, not athletes
        const a = s.athletes.find((x) => x.id === r.athleteId)!;
        if (a.absoluteBoardOptOut && id === 'records') expect(r.name).toBe(PRIVATE_RECORD_HOLDER);
        else if (a.displayMode === 'first_initial') expect(r.name).toBe(`${a.preferredName || a.givenName} ${a.familyName[0]}.`);
      }
    }
  });
});

describe('corrections recalculate PBs, ratings and rankings, and keep history (spec 4.6, 11)', () => {
  const athletes = [
    { id: 'x1', given: 'Aiko', family: 'Testfield' },
    { id: 'x2', given: 'Hana', family: 'Mockridge' },
  ].map((a) => ({
    id: a.id,
    givenName: a.given,
    familyName: a.family,
    preferredName: a.given,
    aliases: [],
    sex: 'F' as const,
    yearGroup: 'Y9' as const,
    yearGroupYear: 2026,
    displayMode: 'full' as const,
    absoluteBoardOptOut: false,
    avatar: { seed: 1, skinTone: 0, hairStyle: 0, hairColour: 0, kitColour: 'academy-navy', accessory: 'none' as const },
    active: true,
  }));
  const circ = (id: string, athleteId: string, date: string, timeSec: number): Performance => ({
    id,
    athleteId,
    courseId: CAMPUS_CIRCUIT_ID,
    date,
    kind: 'circuit',
    timeSec,
    verified: true,
    source: 'coach',
    rawInput: '',
    history: [],
  });
  const base: DataSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    athletes,
    courses: seedCourses(),
    events: [],
    performances: [circ('c1', 'x1', '2026-10-01', 330), circ('c2', 'x2', '2026-10-01', 320), circ('c3', 'x1', '2026-10-15', 325)],
    participation: [],
    achievements: [],
    configs: [DEFAULT_CONFIG],
    calendar: { holidayWeeks: [], halfTerms: [] },
    meta: {},
  };

  it('worked flow', () => {
    const before = deriveAll(base, TODAY);
    const aiko0 = before.athletes.get('x1')!;
    expect(aiko0.pbs.find((p) => p.key === `course:${CAMPUS_CIRCUIT_ID}`)?.value).toBe(325);
    const order0 = buildBoard('spd', before, { full: true }).groups.flatMap((g) => g.rows).map((r) => r.athleteId);
    expect(order0).toEqual(['x2', 'x1']); // 5:20 beats 5:25

    // The 5:25 was really 5:15: correct it with a reason.
    const fixed = correctPerformance(base.performances[2], { timeSec: 315 }, 'typo in the results sheet', 'Coach', '2026-10-22T10:00:00.000Z')!;
    const s1 = { ...base, performances: [base.performances[0], base.performances[1], fixed] };
    const after = deriveAll(s1, TODAY);
    const aiko1 = after.athletes.get('x1')!;
    expect(aiko1.pbs.find((p) => p.key === `course:${CAMPUS_CIRCUIT_ID}`)?.value).toBe(315);
    expect(aiko1.ratings.stats.SPD.value!).toBeGreaterThan(aiko0.ratings.stats.SPD.value!);
    expect(buildBoard('spd', after, { full: true }).groups.flatMap((g) => g.rows).map((r) => r.athleteId)).toEqual(['x1', 'x2']);
    expect(aiko1.perfs.find((p) => p.id === 'c3')!.history).toHaveLength(1);
    expect(diffRatings(before, after).some((c) => c.athleteId === 'x1' && c.stat === 'SPD' && c.delta > 0)).toBe(true);

    // Deleting it (soft) falls back to the 5:30, and the record is still there with its history.
    const del = deletePerformance(fixed, 'wrong athlete', 'Coach', '2026-10-22T10:05:00.000Z');
    const s2 = { ...base, performances: [base.performances[0], base.performances[1], del] };
    const after2 = deriveAll(s2, TODAY);
    expect(after2.athletes.get('x1')!.pbs.find((p) => p.key === `course:${CAMPUS_CIRCUIT_ID}`)?.value).toBe(330);
    expect(after2.athletes.get('x1')!.perfs.find((p) => p.id === 'c3')!.history).toHaveLength(2);
  });

  it('every rating records the config version it was computed with', () => {
    const v2 = { ...cloneConfig(DEFAULT_CONFIG), version: 2 };
    const d = deriveAll({ ...base, configs: [DEFAULT_CONFIG, v2] }, TODAY);
    expect(d.configVersion).toBe(2);
    expect(d.athletes.get('x1')!.ratings.stats.SPD.configVersion).toBe(2);
  });
});
