import { describe, expect, it } from 'vitest';
import { academicYearOf, addDays, addMonths, addWeeks, dayNumber, daysBetween, formatLongDate, formatShortDate, fromDayNumber, isISODate, isoWeek, monthsBetween, todayTokyo, weekMonday, weekSunday, weeksInRange } from './dates';
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

describe('dates: boundaries the scoring depends on', () => {
  it('monthsBetween at the freshness boundaries (as of 22 Oct 2026)', () => {
    expect(monthsBetween('2026-07-22', '2026-10-22')).toBe(3);
    expect(monthsBetween('2026-04-22', '2026-10-22')).toBe(6); // exactly 6: still no penalty
    expect(monthsBetween('2026-04-21', '2026-10-22')).toBe(6); // 6 months and a day
    expect(monthsBetween('2026-03-23', '2026-10-22')).toBe(6); // a day short of 7
    expect(monthsBetween('2026-03-22', '2026-10-22')).toBe(7);
    expect(monthsBetween('2025-10-22', '2026-10-22')).toBe(12);
    expect(monthsBetween('2025-10-23', '2026-10-22')).toBe(11); // a day short of 12 (inside a 12-month window)
    expect(monthsBetween('2024-10-22', '2026-10-22')).toBe(24); // exactly 24: still counts
    expect(monthsBetween('2024-09-23', '2026-10-22')).toBe(24);
    expect(monthsBetween('2024-09-22', '2026-10-22')).toBe(25); // expired
    expect(monthsBetween('2024-04-22', '2026-10-22')).toBe(30);
    expect(monthsBetween('2026-10-22', '2026-10-22')).toBe(0);
  });

  it('monthsBetween across a leap day and a year end', () => {
    expect(monthsBetween('2024-02-29', '2024-03-29')).toBe(1);
    expect(monthsBetween('2024-02-29', '2025-02-28')).toBe(11);
    expect(monthsBetween('2024-02-29', '2025-03-01')).toBe(12);
    expect(monthsBetween('2026-12-15', '2027-01-15')).toBe(1);
  });

  it('ISO weeks around year ends (weeks run Monday–Sunday)', () => {
    expect(isoWeek('2020-12-31')).toBe('2020-W53');
    expect(isoWeek('2021-01-03')).toBe('2020-W53'); // Sunday
    expect(isoWeek('2021-01-04')).toBe('2021-W01'); // Monday
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
    expect(isoWeek('2026-12-28')).toBe('2026-W53');
    expect(weekMonday('2026-W53')).toBe('2026-12-28');
    expect(weekSunday('2026-W53')).toBe('2027-01-03');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
    expect(weeksInRange('2026-W52', '2027-W02')).toEqual(['2026-W52', '2026-W53', '2027-W01', '2027-W02']);
    expect(weeksInRange('2026-W46', '2026-W45')).toEqual([]);
  });

  it('day numbers round-trip, including leap days', () => {
    for (const d of ['1970-01-01', '2024-02-29', '2026-10-22', '2100-03-01']) expect(fromDayNumber(dayNumber(d))).toBe(d);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-11-29', '2026-11-01')).toBe(-28);
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('addMonths clamps to the end of the month and goes backwards', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-10-22', -12)).toBe('2025-10-22');
    expect(addMonths('2026-10-22', -24)).toBe('2024-10-22');
  });

  it('academic year with a custom start date', () => {
    expect(academicYearOf('2026-08-31', 9, 1)).toBe(2025);
    expect(academicYearOf('2027-04-01', 4, 1)).toBe(2027);
    expect(academicYearOf('2027-03-31', 4, 1)).toBe(2026);
  });

  it('short and long date labels for cards', () => {
    expect(formatShortDate('2026-11-10')).toBe('10 Nov');
    expect(formatLongDate('2025-09-01')).toBe('1 Sep 2025');
  });

  it('today in Tokyo flips at 15:00 UTC', () => {
    expect(todayTokyo(new Date('2026-10-22T14:59:59Z'))).toBe('2026-10-22');
    expect(todayTokyo(new Date('2026-10-22T15:00:00Z'))).toBe('2026-10-23');
  });
});

describe('age on a date: more cases (spec 3.2)', () => {
  it('Y13 on 31 August (end of the academic year): 17 + 0.5 + 364 / 365.25', () => {
    const a = ageOnDate({ yearGroup: 'Y13', yearGroupYear: 2026 }, '2027-08-31', DEFAULT_CONFIG);
    expect(a.age).toBeCloseTo(17.5 + 364 / 365.25, 9);
    expect(a.estimated).toBe(true);
  });

  it('every year group on 1 September is its base age + 0.5', () => {
    const ys = ['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13'] as const;
    expect(ys.map((yearGroup) => ageOnDate({ yearGroup, yearGroupYear: 2026 }, '2026-09-01', DEFAULT_CONFIG).age)).toEqual([11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5]);
  });

  it('without yearGroupYear the academic year of the as-of date is used (default as-of = the date itself)', () => {
    // Y8 on 2027-01-10, as of the same date: academic year 2026 → 12.5 + 131 / 365.25
    expect(ageOnDate({ yearGroup: 'Y8' }, '2027-01-10', DEFAULT_CONFIG).age).toBeCloseTo(12.5 + 131 / 365.25, 9);
  });

  it('a dob beats the year-group estimate, for staff too', () => {
    const a = ageOnDate({ dob: '1990-06-15', yearGroup: 'Staff' }, '2026-06-15', DEFAULT_CONFIG);
    expect(a.estimated).toBe(false);
    expect(a.age).toBeCloseTo(daysBetween('1990-06-15', '2026-06-15') / 365.25, 9);
    expect(a.age).toBeCloseTo(36, 2);
  });

  it('constants come from config (staff default, mid-year offset, year-group ages)', () => {
    const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as typeof DEFAULT_CONFIG;
    c.age.staffDefaultAge = 35;
    c.age.midYearOffset = 0;
    c.age.yearGroupAgeOnSept1.Y7 = 12;
    expect(ageOnDate({ yearGroup: 'Staff' }, '2026-11-01', c).age).toBe(35);
    expect(ageOnDate({ yearGroup: 'Y7', yearGroupYear: 2026 }, '2026-09-01', c).age).toBe(12);
  });

  it('a dob that is not a real ISO date is ignored: the year-group estimate is used (it used to give NaN)', () => {
    // Y9 (2026–27) on 1 Sept 2026: 13 + 0.5 + 0 = 13.5
    for (const dob of ['12/03/2012', '2012-3-1', '2012-02-30', 'unknown']) {
      expect(ageOnDate({ dob, yearGroup: 'Y9', yearGroupYear: 2026 }, '2026-09-01', DEFAULT_CONFIG)).toEqual({ age: 13.5, estimated: true });
    }
    expect(ageOnDate({ dob: 'unknown', yearGroup: 'Staff' }, '2026-09-01', DEFAULT_CONFIG)).toEqual({ age: 30, estimated: true });
  });

  it('a dob after the date (a typo) is ignored rather than giving a negative age', () => {
    // Before the fix: (2026-09-01 − 2030-01-01) / 365.25 = −3.33 years, which the table clamped to age 5.
    expect(ageOnDate({ dob: '2030-01-01', yearGroup: 'Y9', yearGroupYear: 2026 }, '2026-09-01', DEFAULT_CONFIG)).toEqual({ age: 13.5, estimated: true });
    // A dob on the date itself is still used (age 0); plausibility is checked by the athlete editor.
    expect(ageOnDate({ dob: '2026-09-01', yearGroup: 'Y9' }, '2026-09-01', DEFAULT_CONFIG)).toEqual({ age: 0, estimated: false });
  });

  it('decimal age from a dob across a birthday: 1 day before 14 vs on the birthday', () => {
    // dob 2012-10-22: on 2026-10-21 = 5112 days / 365.25 = 13.996; on 2026-10-22 = 5113 / 365.25 = 13.999
    // (365.25-day years run slightly ahead of the calendar here, so floor(age) only reaches 14 a day later)
    expect(ageOnDate({ dob: '2012-10-22', yearGroup: 'Y10' }, '2026-10-21', DEFAULT_CONFIG).age).toBeCloseTo(5112 / 365.25, 9);
    expect(ageOnDate({ dob: '2012-10-22', yearGroup: 'Y10' }, '2026-10-22', DEFAULT_CONFIG).age).toBeCloseTo(5113 / 365.25, 9);
  });
});
