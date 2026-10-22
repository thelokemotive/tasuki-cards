// View model for a trading card, built from derived data. The card component only renders this.
// DOB and coach-only notes are never part of a card.
import type { Avatar, YearGroup } from '../../types';
import type { AthleteDerived } from '../../engine/derive';
import type { AvatarUnlocks } from '../../engine/avatarUnlocks';
import type { Badge, RatingKey, StatKey, Tier } from '../../engine/types';
import { STAT_KEYS } from '../../engine/types';
import { displayName } from '../../engine/display';
import { formatShortDate } from '../../engine/dates';

export interface CardStat {
  key: RatingKey;
  locked: boolean;
  value?: number;
  /** ≤ 3 words, shown when locked */
  hint?: string;
  /** '12 Aug' — date of the performance behind the stat */
  date?: string;
  provisional: boolean;
  shielded: boolean;
}

export interface CardData {
  athleteId: string;
  name: string;
  yearGroup: YearGroup;
  ovr: string;
  unlocked: number;
  tier: Tier;
  inForm: boolean;
  /** e.g. 'PB −12 s' */
  inFormText?: string;
  race: CardStat & { caps: number; line?: string };
  stats: CardStat[];
  streak: number;
  holidayFlames: number;
  badges: Badge[];
  avatar: Avatar;
  unlocks: AvatarUnlocks;
  provisionalAny: boolean;
}

const LABEL: Record<StatKey, string> = { SPD: 'SPD', END: 'END', CLB: 'CLB', DSC: 'DSC', NAV: 'NAV', ARM: 'ARM' };
export const STAT_NAMES: Record<RatingKey, string> = {
  RACE: 'Race',
  SPD: 'Speed',
  END: 'Endurance',
  CLB: 'Climb',
  DSC: 'Descent',
  NAV: 'Navigation',
  ARM: 'Armour',
};

export function buildCardData(d: AthleteDerived): CardData {
  const r = d.ratings;
  const firstInForm = d.inForm[0];
  const rawPb = d.inForm.find((x) => x.type === 'raw');
  return {
    athleteId: d.athlete.id,
    name: displayName(d.athlete),
    yearGroup: d.athlete.yearGroup,
    ovr: r.ovr.display,
    unlocked: r.ovr.unlocked,
    tier: r.tier,
    inForm: d.inForm.length > 0,
    inFormText: (rawPb ?? firstInForm)?.text,
    race: {
      key: 'RACE',
      locked: r.race.locked,
      value: r.race.locked ? undefined : r.race.value,
      hint: r.race.unlockHint,
      date: r.race.basis?.date ? formatShortDate(r.race.basis.date) : undefined,
      provisional: r.race.provisional,
      shielded: false,
      caps: r.race.caps,
      line: r.race.bestRaceLine,
    },
    stats: STAT_KEYS.map((k) => {
      const s = r.stats[k];
      return {
        key: LABEL[k] as StatKey,
        locked: s.locked,
        value: s.locked ? undefined : s.value,
        hint: s.unlockHint,
        date: s.basis?.date ? formatShortDate(s.basis.date) : undefined,
        provisional: s.provisional,
        shielded: s.shielded,
      };
    }),
    streak: d.streak.currentStreak,
    holidayFlames: d.streak.holidayBonusFlames,
    badges: d.badgeRow.slice(0, 5),
    avatar: d.athlete.avatar,
    unlocks: d.avatarUnlocks,
    provisionalAny: r.provisionalAny,
  };
}
