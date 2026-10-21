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
