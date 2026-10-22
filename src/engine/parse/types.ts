// Intermediate results of parsing pasted text, before names are matched (see plan.ts).
import type { ArmMeasures, ISODate, ParticipationType, PerfKind, PerfSource } from '../../types';

export type ParseFormat = 'line' | 'table' | 'forms';

/** A block of rows sharing one event/test/participation context. */
export interface RawSection {
  key: string;
  type: 'event' | 'test' | 'participation';
  /** Event or test name ('Bleep test' for a test header). */
  name: string;
  date?: ISODate;
  perfKind?: PerfKind;
  participationType?: Exclude<ParticipationType, 'circuit'>;
  distanceKm?: number;
  climbM?: number;
  /** Header "place p/n" (applies to a single following result). */
  place?: number;
  fieldSize?: number;
  courseName?: string;
  /** NAV test header "<n> km": effective route distance. */
  routeKmEff?: number;
  official: boolean;
  /** 1-based source line of the header (0 for implicit sections). */
  line: number;
  warnings: string[];
}

export interface RawRow {
  /** 1-based source line. */
  line: number;
  raw: string;
  sectionKey: string;
  name: string;
  timeSec?: number;
  /** The time text as written. */
  timeRaw?: string;
  laps?: number;
  arm?: ArmMeasures;
  place?: number;
  fieldSize?: number;
  category?: string;
  legNumber?: number;
  teamName?: string;
  racedEarlierSameDay?: boolean;
  unverified?: boolean;
  cleanRun?: boolean;
  navErrors?: number;
  navVariant?: string;
  routeKmEff?: number;
  /** Forms rows may carry their own distance. */
  distanceKm?: number;
  source: PerfSource;
  warnings: string[];
  errors: string[];
}

export interface RawParse {
  format: ParseFormat;
  sections: RawSection[];
  rows: RawRow[];
  warnings: string[];
}

/** Section used when the text has no headers: filled from the event the coach picked in the UI. */
export interface SectionDefaults {
  name?: string;
  date?: ISODate;
  perfKind?: PerfKind;
  distanceKm?: number;
  climbM?: number;
  courseName?: string;
  official?: boolean;
}
