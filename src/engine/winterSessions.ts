// Winter Mode session cards: six ready-made sessions, so nobody needs a written plan. `{race}` and `{easy}`
// are filled in with the runner's own treadmill speeds (pacePlan). Pain in the heel or knee, or soreness
// of 6+, gets no card: that is the coach's call.
import type { Config } from './config';
import { pacePlan, type WinterSummary } from './winter';

export type WinterSessionId = 'easy' | 'sharp' | 'treadmill' | 'antidote' | 'sore' | 'tempo';

export interface WinterSession {
  id: WinterSessionId;
  title: string;
  minutes: string;
  /** What it counts as in the Rule of 2. */
  counts: string;
  steps: string[];
}

export const WINTER_SESSIONS: WinterSession[] = [
  {
    id: 'easy',
    title: 'Easy run',
    minutes: '20–30 min',
    counts: 'a run',
    steps: ['Chatting pace the whole way: you could talk in full sentences.', 'Treadmill: {easy} or slower, 1% incline.', 'First week back after a break: 20 minutes is plenty.'],
  },
  {
    id: 'sharp',
    title: 'Sharp run',
    minutes: '25–30 min',
    counts: 'a run ⚡',
    steps: ['20 minutes easy.', 'Then 4–6 × 30 seconds at spring race pace ({race} on a treadmill), or up a short hill.', 'Walk or jog 60–90 seconds between. Finish with 3 minutes easy.'],
  },
  {
    id: 'treadmill',
    title: 'Treadmill surges (rain or snow)',
    minutes: '20–25 min',
    counts: 'a run ⚡',
    steps: ['1% incline throughout.', '5 minutes easy at {easy}.', '4 × 1 minute at {race}, 1 minute easy between.', '5 minutes easy. Photo of the screen for the form.'],
  },
  {
    id: 'antidote',
    title: 'Ski-boot antidote',
    minutes: '10 min',
    counts: 'armour',
    steps: ['3 × 20 pogo hops: both feet, quick and light, knees almost straight.', '3 × 15 single-leg calf raises off a step, each leg, slow down.', 'Knee-to-wall ankle stretch: 10 each side.', '3 × 5 one-leg sit-downs to a solid chair, each leg, down in 3 seconds.', 'No equipment: dorm, gym or ski locker room.'],
  },
  {
    id: 'sore',
    title: 'Sore-legs armour (no impact)',
    minutes: '10 min',
    counts: 'armour',
    steps: ['No running or hopping today.', '3 × 15 slow calf raises on both feet.', '3 × 12 glute bridges.', 'Ankle circles and knee-to-wall stretch, 10 each side.', 'Still sore in 2 days, or worse: tell the coach.'],
  },
  {
    id: 'tempo',
    title: 'Staff: maintenance tempo',
    minutes: '35–40 min',
    counts: 'a run ⚡',
    steps: ['10 minutes easy.', '20 minutes comfortably hard (about 1-hour race effort), or 6 × 3 minutes uphill with jog-down recovery.', '10 minutes easy. Once a week keeps the top end alive.'],
  },
];

export function fillSession(s: WinterSession, fiveKSec: number | undefined, config: Config): WinterSession {
  const p = pacePlan(fiveKSec, config);
  const race = p ? `${p.raceKmh.toFixed(1)} km/h` : 'about 5K race effort';
  const easy = p ? `${p.easyKmh.toFixed(1)} km/h` : 'an easy speed';
  return { ...s, steps: s.steps.map((t) => t.replace('{race}', race).replace('{easy}', easy)) };
}

/** The session that fits this runner's week, or undefined (week kept, pain, or not a winter week). */
export function suggestedSession(w: WinterSummary | undefined, isStaff: boolean): WinterSessionId | undefined {
  const tw = w?.thisWeek;
  if (!w || !tw || tw.state === 'kept') return undefined;
  const kinds = new Set(w.flags.map((f) => f.kind));
  if (kinds.has('pain') || kinds.has('growth')) return undefined;
  if (kinds.has('soreness')) return 'sore';
  if (kinds.has('return') || kinds.has('spike')) return 'easy';
  if (tw.runs >= 1) return tw.phase.kind === 'snow' ? 'antidote' : tw.sharp ? 'easy' : isStaff ? 'tempo' : 'sharp';
  return tw.phase.kind === 'snow' ? 'treadmill' : isStaff ? 'tempo' : 'sharp';
}
