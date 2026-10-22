// Avatar unlocks driven by data (spec 5). Pure: thresholds come from config.avatarUnlocks.
// Unlocks only ever add kit and effects; body type and skin tone are never linked to any rating.
import type { Config } from './config';
import type { AthleteRatings, StatKey, StreakResult, SurgeResult } from './types';

export interface AvatarUnlocks {
  /** NAV ≥ navCompass: compass in hand; ≥ navCompassFloat: compass floating above the hand. */
  compass: 'none' | 'hand' | 'float';
  /** ARM ≥ armGuards */
  ankleGuards: boolean;
  /** ARM ≥ armGlow */
  armourGlow: boolean;
  /** SPD ≥ spdLines */
  motionLines: boolean;
  /** SPD ≥ spdLightning */
  lightningTrail: boolean;
  /** CLB ≥ clbWings: contour-line wings */
  contourWings: boolean;
  /** DSC ≥ dscDust: dust burst at the feet */
  dustBurst: boolean;
  /** 1+ race cap: tasuki sash; 3+ caps: gold-edged sash */
  sash: 'none' | 'plain' | 'gold';
  /** Any Tasuki Surge medal: flame on the sash */
  sashFlame: boolean;
  /** Current streak ≥ headbandStreak */
  headband: boolean;
}

/** Nothing unlocked (a brand-new athlete). */
export const NO_UNLOCKS: AvatarUnlocks = {
  compass: 'none',
  ankleGuards: false,
  armourGlow: false,
  motionLines: false,
  lightningTrail: false,
  contourWings: false,
  dustBurst: false,
  sash: 'none',
  sashFlame: false,
  headband: false,
};

/** The displayed value of an unlocked stat; a locked stat never unlocks anything. */
function statValue(ratings: AthleteRatings, key: StatKey): number | undefined {
  const s = ratings.stats[key];
  return s.locked ? undefined : s.value;
}

function atLeast(v: number | undefined, threshold: number): boolean {
  return v != null && v >= threshold;
}

/**
 * Avatar unlocks for one athlete (spec 5). `surges` may be every athlete's results: only this
 * athlete's medals count. The sash flame needs a medal (bronze or gold), not just a relay leg.
 * Example (defaults): NAV 86, ARM 71, SPD 69, 3 caps, streak 8 →
 * compass 'float', ankleGuards, no motion lines, sash 'gold', headband.
 */
export function computeAvatarUnlocks(ratings: AthleteRatings, streak: StreakResult, surges: SurgeResult[], config: Config): AvatarUnlocks {
  const t = config.avatarUnlocks;
  const nav = statValue(ratings, 'NAV');
  const arm = statValue(ratings, 'ARM');
  const spd = statValue(ratings, 'SPD');
  const caps = ratings.race.caps;
  return {
    compass: atLeast(nav, t.navCompassFloat) ? 'float' : atLeast(nav, t.navCompass) ? 'hand' : 'none',
    ankleGuards: atLeast(arm, t.armGuards),
    armourGlow: atLeast(arm, t.armGlow),
    motionLines: atLeast(spd, t.spdLines),
    lightningTrail: atLeast(spd, t.spdLightning),
    contourWings: atLeast(statValue(ratings, 'CLB'), t.clbWings),
    dustBurst: atLeast(statValue(ratings, 'DSC'), t.dscDust),
    sash: caps >= t.goldSashCaps ? 'gold' : caps >= t.sashCaps ? 'plain' : 'none',
    sashFlame: surges.some((s) => s.athleteId === ratings.athleteId && s.medal != null),
    headband: streak.currentStreak >= t.headbandStreak,
  };
}
