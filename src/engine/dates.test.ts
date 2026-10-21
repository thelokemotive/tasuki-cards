import { describe, expect, it } from 'vitest';
import { academicYearOf, addDays, addMonths, addWeeks, daysBetween, isISODate, isoWeek, monthsBetween, todayTokyo, weekMonday, weeksInRange } from './dates';
import { ageOnDate } from './age';
import { DEFAULT_CONFIG } from './config';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('26-2-3')).toBe(false);
  });

  it('computes ISO weeks (Monday–Sunday)', () => {
    expect(isoWeek('2026-11-02')).toBe('2026-W45'); // Monday
    expect(isoWeek('2026-11-08')).toBe('2026-W45'); // Sunday
    expect(isoWeek('2026-11-09')).toBe('2026-W46');
    expect(isoWeek('2027-01-01')).toBe('2026-W53'); // 2026 has 53 ISO weeks
    expect(isoWeek('2025-12-29')).toBe('2026-W01');
    expect(weekMonday('2026-W45')).toBe('2026-11-02');
    expect(addWeeks('2026-W52', 2)).toBe('2027-W01');
    expect(weeksInRange('2026-W44', '2026-W46')).toEqual(['2026-W44', '2026-W45', '2026-W46']);
  });

  it('counts whole calendar months', () => {
    expect(monthsBetween('2026-01-15', '2026-07-14')).toBe(5);
    expect(monthsBetween('2026-01-15', '2026-07-15')).toBe(6);
    expect(monthsBetween('2026-07-15', '2026-01-15')).toBe(0);
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-29')).toBe(28);
    expect(academicYearOf('2026-08-31')).toBe(2025);
    expect(academicYearOf('2026-09-01')).toBe(2026);
  });

  it('today is computed in Asia/Tokyo', () => {
    // 2026-10-21 16:00 UTC is 2026-10-22 01:00 in Tokyo
    expect(todayTokyo(new Date('2026-10-21T16:00:00Z'))).toBe('2026-10-22');
  });
});

describe('age on a date (spec 3.2)', () => {
  it('uses dob when present', () => {
    const a = ageOnDate({ dob: '2012-03-01', yearGroup: 'Y9' }, '2026-03-01', DEFAULT_CONFIG);
    expect(a.estimated).toBe(false);
    expect(a.age).toBeCloseTo(5113 / 365.25, 9); // 14 × 365 + 3 leap days (2016, 2020, 2024)
  });

  it('estimates from year group: Y7 on 1 Sept = 11 + 0.5', () => {
    const a = ageOnDate({ yearGroup: 'Y7', yearGroupYear: 2026 }, '2026-09-01', DEFAULT_CONFIG);
    expect(a).toEqual({ age: 11.5, estimated: true });
  });

  it('adds the fraction of the year elapsed since 1 September', () => {
    const a = ageOnDate({ yearGroup: 'Y13', yearGroupYear: 2026 }, '2027-03-02', DEFAULT_CONFIG);
    expect(a.age).toBeCloseTo(17.5 + 182 / 365.25, 9);
  });

  it('uses the academic year of the as-of date when yearGroupYear is absent, so older results get a younger age', () => {
    const a = ageOnDate({ yearGroup: 'Y9' }, '2025-11-01', DEFAULT_CONFIG, '2026-11-01');
    expect(a.age).toBeCloseTo(13.5 + daysBetween('2026-09-01', '2025-11-01') / 365.25, 9);
    expect(a.age).toBeLessThan(13);
  });

  it('staff without dob are 30', () => {
    expect(ageOnDate({ yearGroup: 'Staff' }, '2026-11-01', DEFAULT_CONFIG)).toEqual({ age: 30, estimated: true });
  });
});
