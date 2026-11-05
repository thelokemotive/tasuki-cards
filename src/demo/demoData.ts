// Demo data (spec 0 and 11): obviously fictional athletes and results for trying the app out.
// Every record created here carries demo: true, so "Clear all demo data" removes exactly these records
// and leaves an empty app (the seeded Campus Circuit and config stay: they are not demo data).
// Deterministic: the same `today` always gives the same data (seeded generator, no Math.random).
import type {
  Athlete,
  Calendar,
  Course,
  DataSnapshot,
  DisplayMode,
  HalfTerm,
  ISODate,
  ManualAchievement,
  Participation,
  Performance,
  Sex,
  TasukiEvent,
  YearGroup,
} from '../types';
import { BLEEP_PERCENTILES, DEFAULT_CONFIG } from '../engine/config';
import { academicYearOf, addDays, addMonths, addWeeks, daysBetween, isoWeek, weekMonday, weekSunday } from '../engine/dates';
import { ageOnDate } from '../engine/age';
import { standardTime } from '../engine/standards';
import { bleepRow, fixedAgeAdjustment } from '../engine/scoring';
import { counts, makeLookup, resolveContext } from '../engine/perf';
import { isCircuitPerf } from '../engine/streak';
import { predictLegTime } from '../engine/surge';
import { formatTime } from '../engine/format';
import { defaultAvatar, hashString, KIT_COLOURS } from '../engine/avatarDefaults';

/** The seeded course (spec 2). Not demo data: it stays when demo data is cleared. */
export const CAMPUS_CIRCUIT_ID = 'course-campus-circuit';

/** Every demo id starts with this (half-terms have no demo flag, so their id marks them). */
export const DEMO_ID_PREFIX = 'demo-';

/** Spec 2: seed one course, "Campus Circuit", circuit, 1.30 km, climb 0, age_grade. */
export function seedCourses(): Course[] {
  return [
    {
      id: CAMPUS_CIRCUIT_ID,
      name: 'Campus Circuit',
      kind: 'circuit',
      distanceKm: 1.3,
      climbM: 0,
      terrainFactor: 1,
      benchmarkMode: 'age_grade',
      version: 1,
      notes: 'Seeded course.',
    },
  ];
}

/** True for a record created by "Load demo data". */
export function isDemoRecord(r: { demo?: boolean }): boolean {
  return r.demo === true;
}

/** Demo half-terms are marked by their id (HalfTerm has no demo flag). */
export function isDemoHalfTerm(h: HalfTerm): boolean {
  return h.id.startsWith(DEMO_ID_PREFIX);
}

/** Add the demo calendar to an existing one (union of holiday weeks; half-terms by id), sorted. */
export function mergeDemoCalendar(existing: Calendar, demo: Calendar): Calendar {
  const holidayWeeks = [...new Set([...existing.holidayWeeks, ...demo.holidayWeeks])].sort();
  const byId = new Map(existing.halfTerms.map((h) => [h.id, h]));
  for (const h of demo.halfTerms) if (!byId.has(h.id)) byId.set(h.id, h);
  const halfTerms = [...byId.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
  return { holidayWeeks, halfTerms };
}

/**
 * Remove the demo calendar: demo half-terms, and the holiday weeks that sit in the gaps between
 * consecutive demo half-terms (every demo holiday week is placed in such a gap). The coach's own
 * half-terms, and holiday weeks outside those gaps, are kept.
 */
export function stripDemoCalendar(calendar: Calendar): Calendar {
  const demo = calendar.halfTerms.filter(isDemoHalfTerm).sort((a, b) => (a.start < b.start ? -1 : 1));
  const inGap = (w: string) => {
    const mon = weekMonday(w);
    const sun = weekSunday(w);
    for (let i = 0; i + 1 < demo.length; i++) if (mon > demo[i].end && sun < demo[i + 1].start) return true;
    return false;
  };
  return { holidayWeeks: calendar.holidayWeeks.filter((w) => !inGap(w)), halfTerms: calendar.halfTerms.filter((h) => !isDemoHalfTerm(h)) };
}

/** The snapshot with every demo record and the demo calendar removed ("Clear all demo data"). */
export function withoutDemoData(s: DataSnapshot): DataSnapshot {
  const keep = <T extends { demo?: boolean }>(rows: T[]) => rows.filter((r) => !isDemoRecord(r));
  return {
    ...s,
    athletes: keep(s.athletes),
    courses: keep(s.courses),
    events: keep(s.events),
    performances: keep(s.performances),
    participation: keep(s.participation),
    achievements: keep(s.achievements),
    calendar: stripDemoCalendar(s.calendar),
    meta: { ...s.meta, demoLoaded: false },
  };
}

// ---------------------------------------------------------------------------------------------------
// The invented roster. Family names are deliberately fake; abilities are age-graded fractions (road).

interface DemoSpec {
  given: string;
  family: string;
  sex: Sex;
  year: YearGroup;
  mode: DisplayMode;
  publicAlias?: string;
  aliases?: string[];
  /** Base road age grade (0.66 = 66%). */
  ag: number;
  /** Climb strength relative to flat running (default 0.9). */
  climb?: number;
  /** Chance of running the Circuit in a given week. */
  attend: number;
  /** Runs the Circuit every (non-holiday) week for the last n weeks. */
  keeperWeeks?: number;
  /** Always races when eligible. */
  racer?: boolean;
  parkrun?: boolean;
  optOut?: boolean;
  /** Left the academy this many weeks ago (inactive). */
  leftWeeksAgo?: number;
  dob?: ISODate;
  /** ARM tests never include the calf domain (so ARM stays locked). */
  partialArm?: boolean;
}

const ROSTER: DemoSpec[] = [
  { given: 'Aiko', family: 'Testfield', sex: 'F', year: 'Y7', mode: 'first_initial', aliases: ['テストフィールド アイコ', 'Aiko T'], ag: 0.62, attend: 0.9, keeperWeeks: 16, racer: true },
  { given: 'Ren', family: 'Placeholder', sex: 'M', year: 'Y7', mode: 'full', ag: 0.54, attend: 0.6, partialArm: true },
  { given: 'Mio', family: 'Sampleberg', sex: 'F', year: 'Y7', mode: 'alias', publicAlias: 'Trail Fox', ag: 0.51, attend: 0.7 },
  { given: 'Ben', family: 'Sampleton', sex: 'M', year: 'Y8', mode: 'first_initial', ag: 0.66, attend: 0.9, keeperWeeks: 16, racer: true, parkrun: true },
  { given: 'Yuna', family: 'Fakehara', sex: 'F', year: 'Y8', mode: 'first_initial', aliases: ['フェイクハラ ユナ'], ag: 0.56, attend: 0.75 },
  { given: 'Toby', family: 'Dummett', sex: 'M', year: 'Y8', mode: 'full', ag: 0.53, attend: 0.55 },
  { given: 'Hana', family: 'Mockridge', sex: 'F', year: 'Y9', mode: 'first_initial', aliases: ['モックリッジ ハナ'], ag: 0.64, attend: 0.9, keeperWeeks: 16, racer: true },
  { given: 'Kenji', family: 'Demoyama', sex: 'M', year: 'Y9', mode: 'first_initial', aliases: ['デモヤマ ケンジ', 'Ken D'], ag: 0.69, climb: 1.02, attend: 0.9, keeperWeeks: 16, racer: true },
  { given: 'Lily', family: 'Testwell', sex: 'F', year: 'Y9', mode: 'first_initial', ag: 0.59, climb: 1.12, attend: 0.8, optOut: true },
  { given: 'Taro', family: 'Fakeworth', sex: 'M', year: 'Y9', mode: 'alias', publicAlias: 'Mountain Goat', ag: 0.55, climb: 1.05, attend: 0.65, partialArm: true },
  { given: 'Sora', family: 'Exampleton', sex: 'M', year: 'Y10', mode: 'first_initial', ag: 0.62, attend: 0.85, racer: true },
  { given: 'Emi', family: 'Mockingham', sex: 'F', year: 'Y10', mode: 'full', ag: 0.6, attend: 0.85, racer: true },
  { given: 'Oscar', family: 'Fictionby', sex: 'M', year: 'Y10', mode: 'first_initial', ag: 0.57, attend: 0.7, leftWeeksAgo: 20 },
  { given: 'Rina', family: 'Notreal', sex: 'F', year: 'Y11', mode: 'first_initial', ag: 0.63, attend: 0.8, racer: true, parkrun: true },
  { given: 'Daichi', family: 'Samplewood', sex: 'M', year: 'Y11', mode: 'first_initial', ag: 0.59, attend: 0.7 },
  { given: 'Grace', family: 'Inventa', sex: 'F', year: 'Y11', mode: 'alias', publicAlias: 'Hill Hare', ag: 0.56, attend: 0.6 },
  { given: 'Jun', family: 'Dummyhill', sex: 'M', year: 'Y11', mode: 'first_initial', ag: 0.58, attend: 0.5 },
  { given: 'Haruto', family: 'Testington', sex: 'M', year: 'Y12', mode: 'first_initial', ag: 0.67, attend: 0.85, racer: true, parkrun: true },
  { given: 'Chloe', family: 'Makebelieve', sex: 'F', year: 'Y12', mode: 'full', ag: 0.61, attend: 0.75, parkrun: true },
  { given: 'Yuki', family: 'Demoford', sex: 'F', year: 'Y12', mode: 'first_initial', ag: 0.58, attend: 0.6 },
  { given: 'Kai', family: 'Fauxley', sex: 'M', year: 'Y13', mode: 'first_initial', ag: 0.72, climb: 1.0, attend: 0.8, racer: true, parkrun: true },
  { given: 'Nanami', family: 'Imaginary', sex: 'F', year: 'Y13', mode: 'first_initial', aliases: ['イマジナリー ナナミ'], ag: 0.65, attend: 0.75 },
  { given: 'Leo', family: 'Pretendson', sex: 'M', year: 'Y13', mode: 'full', ag: 0.6, attend: 0.6 },
  { given: 'Sakura', family: 'Mockfield', sex: 'F', year: 'Y13', mode: 'first_initial', ag: 0.62, attend: 0.7 },
  { given: 'Coach', family: 'Example', sex: 'M', year: 'Staff', mode: 'full', ag: 0.6, attend: 0.6, keeperWeeks: 9, racer: true, parkrun: true },
  { given: 'Coach', family: 'Sample', sex: 'F', year: 'Staff', mode: 'full', ag: 0.56, attend: 0.5, parkrun: true, dob: '1981-06-14' },
];

/** Full names of every invented demo athlete (for tests and the Help page). */
export const DEMO_ATHLETE_NAMES: string[] = ROSTER.map((s) => `${s.given} ${s.family}`);

/** Weeks of history before today's week. */
const WEEKS_BACK = 60;
/** Holiday weeks (offsets from today's week). Each sits between two demo half-terms. */
const HOLIDAY_OFFSETS = [-53, -45, -37, -29, -21, -13, -5];
/** The current demo half-term runs this many weeks past today's week. */
const CURRENT_HALF_TERM_AHEAD = 2;
/** Day of the week (0 = Monday) for each kind of session. */
const DOW = { circuit: 2, arm: 1, bleep: 3, trial: 4, saturday: 5, race: 6 } as const;

const cfg = DEFAULT_CONFIG;

/** mulberry32: small deterministic generator. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Laps of the 20 m shuttle run at percentile P (0–99) for a bleep table row (P5…P95). */
function lapsAtPercentile(row: number[], p: number): number {
  const pts: [number, number][] = [[0, 0], ...row.map((l, i): [number, number] => [BLEEP_PERCENTILES[i], l])];
  const top = pts[pts.length - 1];
  if (p >= top[0]) return Math.round(top[1] * (1 + (p - top[0]) * 0.04));
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p0, l0] = pts[i];
    const [p1, l1] = pts[i + 1];
    if (p >= p0 && p <= p1) return Math.max(1, Math.round(l0 + ((p - p0) / (p1 - p0)) * (l1 - l0)));
  }
  return 1;
}

/** Drop keys whose value is undefined, so stored records stay clean and exports compare identically. */
function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

export type DemoData = Pick<DataSnapshot, 'athletes' | 'courses' | 'events' | 'performances' | 'participation' | 'achievements'> & { calendar: Calendar };

/**
 * Build the demo data set as of `today`: 24 invented students (Y7–Y13, both sexes) and 2 invented
 * staff, with about 14 months of results up to today: weekly Circuit runs (streaks, a holiday week and
 * a freeze), races with places, parkruns, long runs, a relay with 8 legs and solo baselines, bleep, ARM
 * and NAV tests, a climb, a descent (one run not clean), a student-reported unverified result, a result
 * over 24 months old, PBs in the last 7 days, a correction with history, a soft-deleted duplicate and
 * an expedition. Courses returned are the demo courses only (the Campus Circuit comes from seedCourses).
 */
const DEMO_HOUSES = ['Matsu', 'Take', 'Ume'];

export function buildDemoData(today: ISODate): DemoData {
  const rand = generator(hashString('tasuki-cards-demo'));
  const between = (a: number, b: number) => a + (b - a) * rand();

  const thisWeek = isoWeek(today);
  const weekAt = (offset: number) => addWeeks(thisWeek, offset);
  const dayAt = (offset: number, dow: number) => addDays(weekMonday(weekAt(offset)), dow);
  const timelineStart = weekMonday(weekAt(-WEEKS_BACK));
  const ay = academicYearOf(today, cfg.age.academicYearStartMonth, cfg.age.academicYearStartDay);
  const sept1 = (y: number) => `${y}-${String(cfg.age.academicYearStartMonth).padStart(2, '0')}-${String(cfg.age.academicYearStartDay).padStart(2, '0')}`;
  const holidaySet = new Set(HOLIDAY_OFFSETS);
  const stamp = (d: ISODate, hh = '09') => `${d}T${hh}:00:00.000Z`;

  // ---- courses -----------------------------------------------------------------------------------
  const climbCourse: Course = { id: 'demo-course-hill-climb', name: 'Demo Hill Climb', kind: 'climb', distanceKm: 1.6, climbM: 180, terrainFactor: 1.1, benchmarkMode: 'age_grade', version: 1, notes: 'Invented demo course.', demo: true };
  const descentCourse: Course = { id: 'demo-course-descent', name: 'Demo Descent', kind: 'descent', distanceKm: 1.2, climbM: 0, terrainFactor: 1, benchmarkMode: 'fixed', t99OpenM: 230, t99OpenF: 260, version: 1, notes: 'Invented demo course.', demo: true };
  const navCourse: Course = { id: 'demo-course-nav-loop', name: 'Demo Orienteering Loop', kind: 'nav', distanceKm: 2.4, climbM: 40, terrainFactor: 1, benchmarkMode: 'age_grade', version: 1, notes: 'Invented demo course.', demo: true };
  const courses = [climbCourse, descentCourse, navCourse];
  const circuit = seedCourses()[0];

  // ---- athletes ----------------------------------------------------------------------------------
  interface DemoAthlete {
    spec: DemoSpec;
    a: Athlete;
    name: string;
    from: ISODate;
    to: ISODate;
  }
  const roster: DemoAthlete[] = ROSTER.map((spec) => {
    const id = `${DEMO_ID_PREFIX}ath-${spec.given.toLowerCase()}-${spec.family.toLowerCase()}`;
    const avatar = { ...defaultAvatar(id), kitColour: KIT_COLOURS[hashString(`${id}:kit`) % KIT_COLOURS.length].key };
    const a: Athlete = clean({
      id,
      givenName: spec.given,
      familyName: spec.family,
      preferredName: spec.given,
      aliases: spec.aliases ?? [],
      sex: spec.sex,
      yearGroup: spec.year,
      yearGroupYear: ay,
      dob: spec.dob,
      displayMode: spec.mode,
      publicAlias: spec.publicAlias,
      absoluteBoardOptOut: spec.optOut === true,
      // Invented demo houses (pine, bamboo, plum), so the house cup has something to show.
      house: spec.year === 'Staff' ? undefined : DEMO_HOUSES[hashString(`${id}:house`) % DEMO_HOUSES.length],
      avatar,
      active: spec.leftWeeksAgo == null,
      notes: spec.leftWeeksAgo != null ? 'Demo athlete (invented). Left the academy.' : 'Demo athlete (invented).',
      demo: true,
      createdAt: stamp(timelineStart, '08'),
    });
    const from = spec.year === 'Y7' ? sept1(ay) : spec.year === 'Y8' ? sept1(ay - 1) : timelineStart;
    const to = spec.leftWeeksAgo != null ? dayAt(-spec.leftWeeksAgo, 6) : today;
    return { spec, a, name: `${spec.given} ${spec.family}`, from: from > timelineStart ? from : timelineStart, to };
  });
  const by = (given: string, family: string) => roster.find((r) => r.spec.given === given && r.spec.family === family) as DemoAthlete;
  const activeOn = (r: DemoAthlete, d: ISODate) => d >= r.from && d <= r.to && d <= today;

  /** Age-graded ability on a date: juniors improve most over the 14 months. */
  const growth = (y: YearGroup) => (y === 'Staff' ? 0 : ['Y7', 'Y8', 'Y9'].includes(y) ? 0.06 : ['Y10', 'Y11'].includes(y) ? 0.04 : 0.02);
  const agOn = (r: DemoAthlete, d: ISODate) => r.spec.ag * (1 + (growth(r.spec.year) * Math.max(0, daysBetween(timelineStart, d))) / (WEEKS_BACK * 7));
  const ageOn = (r: DemoAthlete, d: ISODate) => ageOnDate(r.a, d, cfg, today).age;
  /** Time (s) for a run of effective distance dEff at a given relative effort (1 = road race). */
  const timeFor = (r: DemoAthlete, d: ISODate, dEff: number, factor: number, noise: number) =>
    Math.round(standardTime(ageOn(r, d), r.spec.sex, dEff, cfg) / (agOn(r, d) * factor * (1 + noise)));

  // ---- builders ----------------------------------------------------------------------------------
  const events: TasukiEvent[] = [];
  const performances: Performance[] = [];
  const participation: Participation[] = [];
  let perfSeq = 0;
  const addEvent = (e: Omit<TasukiEvent, 'demo' | 'official'> & { official?: boolean }): TasukiEvent => {
    const ev: TasukiEvent = clean({ official: false, ...e, demo: true });
    events.push(ev);
    return ev;
  };
  const addPerf = (r: DemoAthlete, p: Partial<Performance> & Pick<Performance, 'date' | 'kind'>): Performance => {
    perfSeq++;
    const perf: Performance = clean({
      id: `${DEMO_ID_PREFIX}perf-${String(perfSeq).padStart(4, '0')}`,
      athleteId: r.a.id,
      verified: true,
      source: 'coach',
      rawInput: '',
      history: [],
      createdAt: stamp(p.date),
      ...p,
      demo: true,
    });
    performances.push(perf);
    return perf;
  };
  const addPart = (r: DemoAthlete, type: Participation['type'], date: ISODate) => {
    participation.push({ id: `${DEMO_ID_PREFIX}part-${String(participation.length + 1).padStart(4, '0')}`, athleteId: r.a.id, isoWeek: isoWeek(date), type, date, demo: true });
  };

  // ---- weekly Circuit, Saturday runs and a freeze ------------------------------------------------
  const kenji = by('Kenji', 'Demoyama');
  const freezeOffset = -7;
  addPart(kenji, 'freeze', dayAt(freezeOffset, 0));
  for (let off = -WEEKS_BACK; off <= 0; off++) {
    if (holidaySet.has(off)) continue;
    const date = dayAt(off, DOW.circuit);
    if (date > today) continue;
    let session: TasukiEvent | undefined;
    for (const r of roster) {
      const draw = rand();
      if (!activeOn(r, date)) continue;
      if (r === kenji && off === freezeOffset) continue;
      const keeper = r.spec.keeperWeeks != null && off >= -r.spec.keeperWeeks;
      if (!keeper && draw >= r.spec.attend) continue;
      session ??= addEvent({ id: `${DEMO_ID_PREFIX}evt-circuit-${date}`, name: 'Campus Circuit', date, kind: 'session', courseId: CAMPUS_CIRCUIT_ID });
      const t = timeFor(r, date, circuit.distanceKm, 0.95, between(-0.035, 0.03));
      addPerf(r, { eventId: session.id, courseId: CAMPUS_CIRCUIT_ID, date, kind: 'circuit', timeSec: t, rawInput: `${r.name} ${formatTime(t)}` });
    }
    const sat = dayAt(off, DOW.saturday);
    for (const r of roster) {
      const draw = rand();
      if (r.spec.keeperWeeks != null || r === kenji || !activeOn(r, sat) || draw >= 0.12) continue;
      addPart(r, 'saturday_run', sat);
    }
  }

  // ---- races (Sundays), with places among a bigger field ----------------------------------------
  const isJunior = (y: YearGroup) => y === 'Y7' || y === 'Y8' || y === 'Y9';
  const raceDefs: { key: string; name: string; off: number; km: number; climb: number; who: (y: YearGroup) => boolean; p: number }[] = [
    { key: 'valley-xc', name: 'Demo Valley XC', off: -58, km: 4, climb: 60, who: () => true, p: 0.55 },
    { key: 'park-5k', name: 'Sampleton Park 5K', off: -46, km: 5, climb: 0, who: () => true, p: 0.5 },
    { key: 'fell', name: 'Mockridge Fell Race', off: -34, km: 6.5, climb: 350, who: (y) => !['Y7', 'Y8'].includes(y), p: 0.45 },
    { key: 'trail-10k', name: 'Testfield Trail 10K', off: -22, km: 10, climb: 200, who: (y) => !isJunior(y), p: 0.5 },
    { key: 'hills-xc', name: 'Demo Hills XC', off: -10, km: 4, climb: 60, who: () => true, p: 0.65 },
    { key: 'forest-3k', name: 'Fictional Forest 3K', off: -6, km: 3, climb: 30, who: isJunior, p: 0.7 },
  ];
  const raceResults = new Map<string, Performance[]>();
  for (const def of raceDefs) {
    const date = dayAt(def.off, DOW.race);
    const field = roster.filter((r) => {
      const draw = rand();
      return activeOn(r, date) && def.who(r.spec.year) && (r.spec.racer === true || draw < def.p);
    });
    if (field.length === 0) continue;
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-${def.key}`, name: def.name, date, kind: 'race', distanceKm: def.km, climbM: def.climb, official: true });
    const dEff = def.km + def.climb / 100;
    const runs = field.map((r) => ({ r, t: timeFor(r, date, dEff, 1, between(-0.025, 0.025)) })).sort((x, y) => x.t - y.t);
    let place = 0;
    const list: Performance[] = [];
    for (const { r, t } of runs) {
      place += 1 + Math.floor(rand() * 3);
      list.push(addPerf(r, { eventId: ev.id, date, kind: 'race', timeSec: t, place, source: 'paste', rawInput: `${place} ${r.name} ${formatTime(t)}` }));
    }
    const fieldSize = place + 5 + Math.floor(rand() * 20);
    for (const p of list) p.fieldSize = fieldSize;
    ev.fieldSize = fieldSize;
    raceResults.set(def.key, list);
  }

  // A correction with history: the results sheet had the wrong time.
  const rina = by('Rina', 'Notreal');
  const rinaHills = raceResults.get('hills-xc')?.find((p) => p.athleteId === rina.a.id);
  if (rinaHills && rinaHills.timeSec != null) {
    const wrong = rinaHills.timeSec + 60;
    rinaHills.history = [{ at: stamp(rinaHills.date, '12'), by: 'Coach Example', before: { timeSec: wrong }, after: { timeSec: rinaHills.timeSec }, reason: 'Results sheet listed the wrong time' }];
    rinaHills.rawInput = `${rinaHills.place} ${rina.name} ${formatTime(wrong)}`;
  }

  // Over 24 months old (Career Vault only), and an ultra with 2,400 m of climb.
  const coachEx = by('Coach', 'Example');
  const kai = by('Kai', 'Fauxley');
  const oldDate = addMonths(today, -26);
  const oldRace = addEvent({ id: `${DEMO_ID_PREFIX}evt-classic-10k`, name: 'Demo Classic 10K', date: oldDate, kind: 'race', distanceKm: 10, climbM: 0, official: true });
  for (const r of [coachEx, kai]) {
    const t = timeFor(r, oldDate, 10, 1, between(-0.02, 0.02));
    addPerf(r, { eventId: oldRace.id, date: oldDate, kind: 'race', timeSec: t, source: 'paste', rawInput: `${r.name} ${formatTime(t)}` });
  }
  const ultraDate = dayAt(-30, DOW.saturday);
  const ultra = addEvent({ id: `${DEMO_ID_PREFIX}evt-mountain-ultra`, name: 'Demo Mountain Ultra 50K', date: ultraDate, kind: 'race', distanceKm: 50, climbM: 2400, official: true });
  {
    const t = timeFor(coachEx, ultraDate, 50 + 24, 0.9, 0);
    addPerf(coachEx, { eventId: ultra.id, date: ultraDate, kind: 'race', timeSec: t, place: 41, fieldSize: 160, rawInput: `${coachEx.name} ${formatTime(t)}` });
  }

  // ---- parkruns (Saturdays; some fall in holiday weeks: holiday bonus flames) -------------------
  const ben = by('Ben', 'Sampleton');
  for (let off = -57; off <= -1; off += 4) {
    const date = dayAt(off, DOW.saturday);
    let ev: TasukiEvent | undefined;
    for (const r of roster) {
      const draw = rand();
      if (!r.spec.parkrun || !activeOn(r, date)) continue;
      if (!(draw < 0.55 || (r === ben && off === -13))) continue;
      ev ??= addEvent({ id: `${DEMO_ID_PREFIX}evt-parkrun-${date}`, name: 'Sample Lakeside parkrun', date, kind: 'parkrun', distanceKm: cfg.input.parkrunDefaultKm, climbM: 0 });
      const t = timeFor(r, date, cfg.input.parkrunDefaultKm, 0.99, between(-0.03, 0.02));
      addPerf(r, { eventId: ev.id, date, kind: 'parkrun', timeSec: t, rawInput: `${r.name} ${formatTime(t)}` });
    }
  }

  // ---- long runs (seniors and staff) and one student-reported, unverified holiday run ------------
  for (let off = -WEEKS_BACK; off <= -1; off++) {
    const date = dayAt(off, DOW.race);
    for (const r of roster) {
      const draw = rand();
      if (!['Y12', 'Y13', 'Staff'].includes(r.spec.year) || !activeOn(r, date) || draw >= 0.07) continue;
      const km = Math.round(between(8, 16) * 10) / 10;
      const climbM = Math.round(between(0, 40)) * 10;
      const t = timeFor(r, date, km + climbM / 100, 0.86, between(-0.03, 0.03));
      addPerf(r, { date, kind: 'long_run', distanceKm: km, climbM, timeSec: t, rawInput: `${r.name} long run ${km} km ${formatTime(t)}` });
    }
  }
  const hana = by('Hana', 'Mockridge');
  {
    const date = dayAt(-5, DOW.saturday);
    const t = timeFor(hana, date, 10 + 1.2, 0.85, 0);
    addPerf(hana, { date, kind: 'long_run', distanceKm: 10, climbM: 120, timeSec: t, verified: false, source: 'form', rawInput: `Holiday run reported by ${hana.name}: 10 km, ${formatTime(t)}` });
  }

  // ---- bleep tests --------------------------------------------------------------------------------
  for (const off of [-30, -4]) {
    const date = dayAt(off, DOW.bleep);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-bleep-${date}`, name: 'Demo Bleep Test', date, kind: 'test' });
    for (const r of roster) {
      const draw = rand();
      const noise = between(-8, 8);
      if (!activeOn(r, date) || (r.spec.keeperWeeks == null && draw >= 0.85)) continue;
      const p = Math.min(99, Math.max(3, 20 + (agOn(r, date) - 0.5) * 300 + noise));
      const laps = lapsAtPercentile(bleepRow(r.spec.sex, ageOn(r, date), cfg), p);
      addPerf(r, { eventId: ev.id, date, kind: 'bleep', bleepLaps: laps, rawInput: `${r.name} ${laps} laps` });
    }
  }

  // ---- ARM screening (the second test is a little better) ----------------------------------------
  const armBase = new Map<string, { ankle: number; calf: number; stork: number; hop: boolean }>();
  for (const [i, off] of [-20, -2].entries()) {
    const date = dayAt(off, DOW.arm);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-arm-${date}`, name: 'Demo ARM screening', date, kind: 'test' });
    for (const r of roster) {
      const draws = [rand(), rand(), rand(), rand(), rand()];
      if (!activeOn(r, date) || (r.spec.keeperWeeks == null && draws[0] >= 0.8)) continue;
      const prev = armBase.get(r.a.id);
      const m = prev
        ? { ankle: prev.ankle + Math.round(draws[1] * 3) / 2, calf: prev.calf + Math.floor(draws[2] * 5), stork: prev.stork + Math.floor(draws[3] * 7), hop: prev.hop || draws[4] < 0.3 }
        : { ankle: Math.round((5 + draws[1] * 9) * 2) / 2, calf: 10 + Math.floor(draws[2] * 22), stork: 4 + Math.floor(draws[3] * 32), hop: draws[4] < 0.45 };
      armBase.set(r.a.id, m);
      const arm = r.spec.partialArm ? { ankleCm: m.ankle, storkSec: m.stork, hopStickBothLegs: m.hop } : { ankleCm: m.ankle, calfReps: m.calf, storkSec: m.stork, hopStickBothLegs: m.hop };
      addPerf(r, { eventId: ev.id, date, kind: 'arm', arm, rawInput: `${r.name} ankle ${m.ankle}${r.spec.partialArm ? '' : ` calf ${m.calf}`} stork ${m.stork} hop ${m.hop ? 'yes' : 'no'}${i === 0 ? '' : ' (retest)'}` });
    }
  }

  // ---- climb time trials ---------------------------------------------------------------------------
  const lily = by('Lily', 'Testwell');
  const climbEff = (climbCourse.distanceKm + climbCourse.climbM / 100) * climbCourse.terrainFactor;
  for (const off of [-24, -11]) {
    const date = dayAt(off, DOW.trial);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-climb-${date}`, name: 'Demo Hill Climb trial', date, kind: 'time_trial', courseId: climbCourse.id });
    for (const r of roster) {
      const draw = rand();
      const noise = between(-0.03, 0.03);
      if (!activeOn(r, date) || !(r.spec.keeperWeeks != null || r === lily || draw < 0.5)) continue;
      const t = timeFor(r, date, climbEff, r.spec.climb ?? 0.9, noise);
      addPerf(r, { eventId: ev.id, courseId: climbCourse.id, date, kind: 'climb', timeSec: t, rawInput: `${r.name} ${formatTime(t)}` });
    }
  }

  // ---- descent (fixed benchmark); one run was not clean ------------------------------------------
  const toby = by('Toby', 'Dummett');
  {
    const date = dayAt(-9, DOW.trial);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-descent-${date}`, name: 'Demo Descent trial', date, kind: 'time_trial', courseId: descentCourse.id });
    for (const r of roster) {
      const draw = rand();
      const noise = between(-6, 6);
      if (!activeOn(r, date) || !(r.spec.keeperWeeks != null || r === toby || draw < 0.5)) continue;
      const target = Math.min(95, Math.max(45, 50 + (agOn(r, date) - 0.5) * 150 + noise));
      const t99 = r.spec.sex === 'M' ? (descentCourse.t99OpenM as number) : (descentCourse.t99OpenF as number);
      const t = Math.round((cfg.runScore.max * t99 * fixedAgeAdjustment(ageOn(r, date), r.spec.sex, cfg)) / target);
      const clean = r !== toby;
      addPerf(r, { eventId: ev.id, courseId: descentCourse.id, date, kind: 'descent', timeSec: t, cleanRun: clean, rawInput: `${r.name} ${formatTime(t)}${clean ? '' : ' (fell, not a clean run)'}` });
    }
  }

  // ---- navigation (provisional NAV) --------------------------------------------------------------
  {
    const date = dayAt(-8, DOW.trial);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-nav-${date}`, name: 'Demo Orienteering Loop', date, kind: 'time_trial', courseId: navCourse.id });
    const errorBag = [0, 0, 0, 0, 1, 1, 2, 3];
    for (const r of roster) {
      const draws = [rand(), rand(), rand(), rand()];
      if (!activeOn(r, date) || !(r.spec.keeperWeeks != null || draws[0] < 0.55)) continue;
      const errors = r === kenji ? 0 : errorBag[Math.floor(draws[1] * errorBag.length)];
      const variant = draws[2] < 0.5 ? 'A' : 'B';
      const route = variant === 'A' ? 2.8 : 3.0;
      const pace = timeFor(r, date, circuit.distanceKm, 0.95, 0) / circuit.distanceKm;
      const eff = r === kenji ? 0.97 : Math.min(0.98, Math.max(0.55, 0.6 + (agOn(r, date) - 0.5) * 1.4 + (draws[3] - 0.5) * 0.1));
      const t = Math.max(60, Math.round((route * pace * cfg.nav.allowance) / eff - cfg.nav.penaltySecPerError * errors));
      addPerf(r, { eventId: ev.id, courseId: navCourse.id, date, kind: 'nav', timeSec: t, navErrors: errors, navVariant: variant, routeKmEff: route, rawInput: `${r.name} ${formatTime(t)} ${errors} errors` });
    }
  }

  // ---- PBs in the last 7 days (In-Form) -----------------------------------------------------------
  for (const r of [hana, ben, by('Aiko', 'Testfield')]) {
    const mine = performances.filter((p) => p.athleteId === r.a.id && p.kind === 'circuit').sort((x, y) => (x.date < y.date ? -1 : 1));
    const last = mine[mine.length - 1];
    if (!last || mine.length < 2 || daysBetween(last.date, today) >= cfg.inForm.days) continue;
    const prevBest = Math.min(...mine.slice(0, -1).map((p) => p.timeSec as number));
    last.timeSec = prevBest - (6 + Math.floor(rand() * 8));
    last.rawInput = `${r.name} ${formatTime(last.timeSec)}`;
  }

  // ---- a soft-deleted duplicate (kept with its history) ------------------------------------------
  const tobyLast = performances.filter((p) => p.athleteId === toby.a.id && p.kind === 'circuit').pop();
  if (tobyLast) {
    addPerf(toby, {
      eventId: tobyLast.eventId,
      courseId: tobyLast.courseId,
      date: tobyLast.date,
      kind: 'circuit',
      timeSec: tobyLast.timeSec,
      rawInput: tobyLast.rawInput,
      deleted: true,
      history: [{ at: stamp(tobyLast.date, '15'), by: 'Coach Example', before: { deleted: false }, after: { deleted: true }, reason: 'Duplicate entry' }],
    });
  }

  // ---- relay: 8 legs, Surge measured against solo runs in the 90 days before ---------------------
  {
    const date = dayAt(-3, DOW.race);
    const ev = addEvent({ id: `${DEMO_ID_PREFIX}evt-ekiden`, name: 'Demo Ekiden', date, kind: 'relay', distanceKm: 2, climbM: 20, official: true });
    const lookup = makeLookup([circuit, ...courses], events);
    const legEff = 2 + 20 / 100;
    // Target Surge % per leg; median 1.5% stays under the sanity gate, so +8 and +6 are gold, +4 bronze.
    const legs: { r: DemoAthlete; leg: number; team: string; pct: number; earlier?: boolean }[] = [
      { r: kenji, leg: 1, team: 'Team Kestrel', pct: 8 },
      { r: hana, leg: 2, team: 'Team Kestrel', pct: 1 },
      { r: ben, leg: 3, team: 'Team Kestrel', pct: 4 },
      { r: by('Haruto', 'Testington'), leg: 4, team: 'Team Kestrel', pct: -2, earlier: true },
      { r: kai, leg: 1, team: 'Team Heron', pct: 6 },
      { r: rina, leg: 2, team: 'Team Heron', pct: 0 },
      { r: by('Sora', 'Exampleton'), leg: 3, team: 'Team Heron', pct: 2 },
      { r: by('Emi', 'Mockingham'), leg: 4, team: 'Team Heron', pct: -1, earlier: true },
    ];
    for (const { r, leg, team, pct, earlier } of legs) {
      if (!activeOn(r, date)) continue;
      let pred: number | undefined;
      for (const b of performances) {
        if (b.athleteId !== r.a.id || !counts(b) || !(b.kind === 'race' || b.kind === 'parkrun' || isCircuitPerf(b, lookup))) continue;
        const gap = daysBetween(b.date, date);
        const soloEff = resolveContext(b, lookup).dEff;
        if (gap < 1 || gap > cfg.surge.baselineDays || soloEff == null || b.timeSec == null) continue;
        const p = predictLegTime(b.timeSec, soloEff, legEff, earlier === true, cfg);
        if (pred == null || p < pred) pred = p;
      }
      const t = pred != null ? Math.round(pred / (1 + pct / 100)) : timeFor(r, date, legEff, 1, 0);
      addPerf(r, { eventId: ev.id, date, kind: 'relay_leg', timeSec: t, legNumber: leg, teamName: team, racedEarlierSameDay: earlier, source: 'paste', rawInput: `${r.name}, ${formatTime(t)}, leg ${leg}, team ${team.replace('Team ', '')}${earlier ? ', raced earlier' : ''}` });
    }
  }

  // ---- achievements --------------------------------------------------------------------------------
  const expDate = addMonths(today, -4);
  const achievements: ManualAchievement[] = [kai, by('Nanami', 'Imaginary'), by('Haruto', 'Testington'), by('Chloe', 'Makebelieve'), coachEx].map((r, i) => ({
    id: `${DEMO_ID_PREFIX}ach-expedition-${i + 1}`,
    athleteId: r.a.id,
    type: 'expedition',
    name: `Demo Expedition ${expDate.slice(0, 4)}`,
    date: expDate,
    icon: '🏔️',
    demo: true,
  }));
  achievements.push({ id: `${DEMO_ID_PREFIX}ach-custom-1`, athleteId: by('Mio', 'Sampleberg').a.id, type: 'custom', name: 'Demo kit helper', date: addMonths(today, -2), icon: '🎽', demo: true });

  // ---- calendar: holiday weeks between demo half-terms -------------------------------------------
  const holidayWeeks = HOLIDAY_OFFSETS.map(weekAt).sort();
  const starts = [-WEEKS_BACK, ...HOLIDAY_OFFSETS.map((h) => h + 1)];
  const ends = [...HOLIDAY_OFFSETS.map((h) => h - 1), CURRENT_HALF_TERM_AHEAD];
  const halfTerms: HalfTerm[] = starts.map((s, i) => ({
    id: `${DEMO_ID_PREFIX}ht-${i + 1}`,
    name: `Demo half-term ${i + 1}`,
    start: weekMonday(weekAt(s)),
    end: weekSunday(weekAt(ends[i])),
  }));

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return {
    athletes: roster.map((r) => r.a),
    courses,
    events,
    performances,
    participation,
    achievements,
    calendar: { holidayWeeks, halfTerms },
  };
}
