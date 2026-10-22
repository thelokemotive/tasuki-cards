import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from './config';
import { ageGrade, AGE_GRADE_SOURCE, interpolateKeyed, isAgeGradeProvisional, standardTime } from './standards';
import tables from './data/ageGradeRoad2025.json';

const cfg = DEFAULT_CONFIG;

describe('Alan Jones 2025 road tables (spot checks against the source xlsx, sheet AgeStdSec / AgeStanSec)', () => {
  it('records the source commit', () => {
    expect(AGE_GRADE_SOURCE.commit).toBe('4aac6737cb9f216c90a0a610355667cd3d921c61');
    expect(isAgeGradeProvisional(cfg)).toBe(false);
  });

  // Values read directly from MaleRoadStd2025.xlsx / FemaleRoadStd2025.xlsx.
  it.each([
    ['M', 14, 5, 800],
    ['M', 25, 5, 769],
    ['M', 25, 10, 1584],
    ['M', 50, 10, 1783],
    ['M', 11, 5, 868],
    ['M', 17, 42.195, 7616],
    ['F', 12, 5, 945],
    ['F', 25, 5, 834],
    ['F', 16, 10, 1813],
    ['F', 11, 1.609344, 289],
  ] as const)('%s age %i at %f km = %i s', (sex, age, d, sec) => {
    expect(standardTime(age, sex, d, cfg)).toBeCloseTo(sec, 6);
  });

  it('interpolates decimal age linearly between single-year rows', () => {
    // M 5 km: age 14 = 800, age 15 = 788
    expect(standardTime(14.5, 'M', 5, cfg)).toBeCloseTo(794, 6);
    expect(standardTime(14.25, 'M', 5, cfg)).toBeCloseTo(797, 6);
  });

  it('interpolates log(time) against log(distance) between table distances', () => {
    // M 25: 4 Mile (6.437376 km) = 1000 s, 8 km = 1255 s
    const d0 = 6.437376;
    const expected = Math.exp(Math.log(1000) + ((Math.log(7) - Math.log(d0)) / (Math.log(8) - Math.log(d0))) * (Math.log(1255) - Math.log(1000)));
    expect(standardTime(25, 'M', 7, cfg)).toBeCloseTo(expected, 6);
  });

  it('extrapolates below 1 mile along the 1 mile–5 km slope (Campus Circuit 1.30 km)', () => {
    // M 25: 1 mile = 227 s, 5 km = 769 s
    const slope = Math.log(769 / 227) / Math.log(5 / 1.609344);
    const expected = 227 * Math.pow(1.3 / 1.609344, slope);
    expect(standardTime(25, 'M', 1.3, cfg)).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(180.4, 1);
  });

  it('extrapolates above 200 km along the slope of the two longest distances', () => {
    // M 25: 100 Mile (160.9344 km) = 39790, 200 km = 52800
    const slope = Math.log(52800 / 39790) / Math.log(200 / 160.9344);
    expect(standardTime(25, 'M', 250, cfg)).toBeCloseTo(52800 * Math.pow(250 / 200, slope), 3);
  });

  it('uses the minimum age row below the table minimum', () => {
    expect(standardTime(3, 'F', 5, cfg)).toBeCloseTo(standardTime(tables.F.minAge, 'F', 5, cfg), 9);
  });

  it('computes AG% = Std / time', () => {
    // A 25-year-old man running 5 km in 16:01 (961 s): 769 / 961 = 80.0%
    expect(ageGrade(25, 'M', 5, 961, cfg)).toBeCloseTo(0.8002, 4);
  });
});

describe('provisional fallback table (spec 3.4 fallback)', () => {
  const fb = cloneConfig(DEFAULT_CONFIG);
  fb.ageGrade.table = 'fallback_provisional';

  it('is marked provisional', () => {
    expect(isAgeGradeProvisional(fb)).toBe(true);
  });

  it('open 5 km standards', () => {
    expect(standardTime(25, 'M', 5, fb)).toBeCloseTo(769, 9);
    expect(standardTime(25, 'F', 5, fb)).toBeCloseTo(834, 9);
  });

  it('scales distance with exponent 1.10 below 5 km and 1.06 above', () => {
    expect(standardTime(25, 'M', 2, fb)).toBeCloseTo(769 * Math.pow(2 / 5, 1.1), 9);
    expect(standardTime(25, 'M', 10, fb)).toBeCloseTo(769 * Math.pow(2, 1.06), 9);
  });

  it('applies age factors with linear interpolation (Std = OpenStd / AF)', () => {
    expect(standardTime(14, 'M', 5, fb)).toBeCloseTo(769 / 0.94, 9);
    expect(standardTime(14.5, 'F', 5, fb)).toBeCloseTo(834 / ((0.952 + 0.968) / 2), 9);
    expect(standardTime(24, 'M', 5, fb)).toBeCloseTo(769, 9); // 18–30 = 1.000
    expect(standardTime(8, 'M', 5, fb)).toBeCloseTo(769 / 0.837, 9); // below 10: clamps
  });

  it('interpolateKeyed clamps and interpolates', () => {
    expect(interpolateKeyed({ 10: 1, 20: 3 }, 15)).toBe(2);
    expect(interpolateKeyed({ 10: 1, 20: 3 }, 5)).toBe(1);
    expect(interpolateKeyed({ 10: 1, 20: 3 }, 25)).toBe(3);
  });
});

describe('Alan Jones tables: more spot checks and shape', () => {
  // Read from the source xlsx (sheet AgeStdSec / AgeStanSec) with an independent reader; every one of the
  // 2 × 96 × 22 cells of the JSON was also compared with the xlsx and matched.
  it.each([
    ['M', 13, 1.609344, 250],
    ['M', 60, 21.0975, 4270],
    ['M', 40, 8, 1309],
    ['M', 100, 200, 275143],
    ['M', 70, 10, 2145],
    ['M', 16, 15, 2519],
    ['F', 17, 42.195, 8621],
    ['F', 45, 10, 1860],
    ['F', 5, 5, 1208],
    ['F', 13, 21.0975, 4356],
    ['F', 65, 5, 1169],
    ['F', 30, 1.609344, 253],
  ] as const)('%s age %i at %f km = %i s', (sex, age, d, sec) => {
    expect(standardTime(age, sex, d, cfg)).toBeCloseTo(sec, 6);
  });

  it('has single-year rows 5–100 and 22 ascending distances from 1 mile to 200 km', () => {
    for (const sex of ['M', 'F'] as const) {
      const t = tables[sex];
      expect([t.minAge, t.maxAge, t.standardsSec.length]).toEqual([5, 100, 96]);
      expect(t.distancesKm).toHaveLength(22);
      expect(t.distancesKm[0]).toBeCloseTo(1.609344, 9);
      expect(t.distancesKm[21]).toBe(200);
      for (let i = 1; i < t.distancesKm.length; i++) expect(t.distancesKm[i]).toBeGreaterThan(t.distancesKm[i - 1]);
      t.standardsSec.forEach((row, k) => {
        expect(row).toHaveLength(22);
        const age = t.minAge + k;
        // Known quirk in the source (kept as published): male age 5, 7 Mile = 3579 s but 12 km = 3150 s.
        // No academy athlete is ever scored at age 5 (estimated ages start at 11), so it is left alone.
        for (let i = 1; i < row.length; i++) if (!(sex === 'M' && age === 5 && i === 8)) expect(row[i]).toBeGreaterThan(row[i - 1]);
      });
    }
    expect(tables.M.standardsSec[0].slice(7, 9)).toEqual([3579, 3150]);
  });

  it('Std rises with distance, also between and beyond table distances', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const age of [11, 13.64, 17.5, 30, 55]) {
        const ds = [0.8, 1.0, 1.3, 1.609344, 3, 5, 5.5, 7, 8.02, 12.5, 30, 64, 199, 250];
        const ts = ds.map((d) => standardTime(age, sex, d, cfg));
        for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
      }
    }
  });

  it('decimal age with distance extrapolation: Ben Sampleton (13.64) on the 1.30 km Campus Circuit', () => {
    // Each age row is extrapolated below 1 mile along its own 1 mile–5 km slope, then ages are blended:
    //   age 13: 250 × (1.3 / 1.609344)^(ln(817 / 250) / ln(5 / 1.609344))
    //   age 14: 244 × (1.3 / 1.609344)^(ln(800 / 244) / ln(5 / 1.609344))
    //   Std(13.64) = s13 + 0.64 × (s14 − s13)
    const r = Math.log(5 / 1.609344);
    const s13 = 250 * Math.pow(1.3 / 1.609344, Math.log(817 / 250) / r);
    const s14 = 244 * Math.pow(1.3 / 1.609344, Math.log(800 / 244) / r);
    expect(standardTime(13.64, 'M', 1.3, cfg)).toBeCloseTo(s13 + 0.64 * (s14 - s13), 9);
  });

  it('uses the maximum age row above the table maximum', () => {
    expect(standardTime(104, 'M', 10, cfg)).toBeCloseTo(standardTime(100, 'M', 10, cfg), 9);
  });

  it('rejects a distance that is not positive (callers must not pass D_eff ≤ 0)', () => {
    expect(() => standardTime(25, 'M', 0, cfg)).toThrow();
    expect(() => standardTime(25, 'M', -1, cfg)).toThrow();
    expect(() => standardTime(25, 'M', Number.NaN, cfg)).toThrow();
  });
});

describe('provisional fallback table: more cases', () => {
  const fb = cloneConfig(DEFAULT_CONFIG);
  fb.ageGrade.table = 'fallback_provisional';

  it('5 km itself uses the short exponent and both branches meet there', () => {
    expect(standardTime(25, 'F', 5, fb)).toBeCloseTo(834, 9);
    expect(standardTime(25, 'F', 5.000001, fb)).toBeCloseTo(834, 3);
    expect(standardTime(25, 'F', 4.999999, fb)).toBeCloseTo(834, 3);
  });

  it('interpolates age factors between keys and clamps beyond 60', () => {
    // F 32.5: AF = 1.000 + (2.5 / 5) × (0.982 − 1.000) = 0.991
    expect(standardTime(32.5, 'F', 5, fb)).toBeCloseTo(834 / 0.991, 9);
    // M 13.64: AF = 0.910 + 0.64 × (0.940 − 0.910) = 0.9292
    expect(standardTime(13.64, 'M', 5, fb)).toBeCloseTo(769 / 0.9292, 9);
    expect(standardTime(70, 'F', 5, fb)).toBeCloseTo(834 / 0.795, 9);
  });

  it('AG% with the fallback: a 14-year-old boy running 5 km in 20:00', () => {
    // Std = 769 / 0.94 = 818.09 s; AG = 818.09 / 1200 = 68.17%
    expect(ageGrade(14, 'M', 5, 1200, fb)).toBeCloseTo(769 / 0.94 / 1200, 9);
  });

  it('fallback below 5 km at the Campus Circuit distance (1.30 km), girls, age 12.5', () => {
    // AF(12.5, F) = 0.905 + 0.5 × (0.930 − 0.905) = 0.9175; Std = 834 × (1.3 / 5)^1.10 / 0.9175
    expect(standardTime(12.5, 'F', 1.3, fb)).toBeCloseTo((834 * Math.pow(1.3 / 5, 1.1)) / 0.9175, 9);
  });

  it('the fallback constants come from config', () => {
    const c = cloneConfig(fb);
    c.ageGrade.fallback.open5kSec.M = 800;
    c.ageGrade.fallback.expLong = 1.08;
    expect(standardTime(25, 'M', 5, c)).toBeCloseTo(800, 9);
    expect(standardTime(25, 'M', 10, c)).toBeCloseTo(800 * Math.pow(2, 1.08), 9);
  });
});

describe('standards: bad arguments fail loudly instead of returning a wrong number', () => {
  it('rejects an age that is not a finite number (the table lookup used to crash with a TypeError)', () => {
    expect(() => standardTime(Number.NaN, 'M', 5, cfg)).toThrow(/age/);
    expect(() => standardTime(Infinity, 'F', 5, cfg)).toThrow(/age/);
  });

  it("rejects a sex other than 'M' or 'F'", () => {
    expect(() => standardTime(25, 'X' as never, 5, cfg)).toThrow(/sex/);
  });

  it('rejects an infinite distance (it used to return Infinity)', () => {
    expect(() => standardTime(25, 'M', Infinity, cfg)).toThrow(/distance/);
  });
});

describe('Alan Jones tables: junior ages the academy uses (11–18) at 5 km, against the source', () => {
  it.each([
    ['M', 11, 868],
    ['M', 12, 840],
    ['M', 13, 817],
    ['M', 14, 800],
    ['M', 17, 773],
    ['M', 18, 769],
    ['F', 25, 834],
  ] as const)('%s age %i: %i s', (sex, age, sec) => {
    expect(standardTime(age, sex, 5, cfg)).toBeCloseTo(sec, 9);
  });

  it('Std is non-increasing with age from 11 to 18 (juniors are never held to a harder standard than an older teen)', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const d of [1.3, 5, 10]) {
        let prev = Infinity;
        for (let age = 11; age <= 18; age += 0.25) {
          const s = standardTime(age, sex, d, cfg);
          expect(s).toBeLessThanOrEqual(prev + 1e-9);
          prev = s;
        }
      }
    }
  });
});
