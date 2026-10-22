// Public API of the scoring engine (pure functions; no I/O, no clock). UI code imports from here.
export * from './types';
export * from './config';
export * from './dates';
export * from './age';
export * from './standards';
export * from './perf';
export * from './arm';
export * from './display';
export * from './format';
export * from './scoring';
export * from './stats';
export * from './streak';
export * from './surge';
export * from './pbs';
export * from './badges';
export * from './handicap';
export * from './names';
export * from './corrections';
export * from './avatarUnlocks';
export * from './avatarDefaults';
export * from './derive';
export * from './boards';
// time.ts re-exports the format helpers; name its own exports so they are not exported twice.
export { parseTime, findTimeInText, findTimeProblemInText, paceWarning } from './time';
export type { TimeContext, TimeParse, TimeOptions, TimeMatch, TimeProblem } from './time';
