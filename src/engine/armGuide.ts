// What ARM is, why each plate matters on the trail, and how to build, keep and protect it. Written for pupils
// (short sentences, EAL-friendly). One source for the Armour page, the pupil's own Armour panel and the coach view.
//
// Evidence (kept honest: "linked with", never "prevents"):
// - Ankle dorsiflexion: limited knee-to-wall range is linked with patellar tendinopathy in young athletes
//   (Backman & Danielson 2011, junior basketball) and with ankle sprains; steep climbing needs more of it.
// - Calf: the soleus and gastrocnemius give most of the push-off force in running (Dorn et al. 2012);
//   low heel-raise endurance is linked with medial tibial stress syndrome and Achilles problems
//   (Hébert-Losier et al. 2009 review of the heel-raise test).
// - Single-leg control: knee valgus (caving in) is linked with patellofemoral pain and, in girls, ACL injury
//   (Hewett et al. 2005); neuromuscular warm-ups that train it cut knee injuries in youth sport
//   (FIFA 11+ trials). Strength training improves running economy in runners, including adolescents
//   (Balsalobre-Fernández et al. 2016; Blagrove et al. 2018).
// - Keeping strength over a break: much less training holds it if some intensity stays (Spiering et al. 2021).
import type { ArmLevels } from './types';
import type { Config } from './config';
import { ARM_DOMAINS, nextLevelTarget, plateName, throneLabel, type ArmDomain } from './arm';
import { armScoreClamped } from './scoring';

export interface PlateGuide {
  domain: ArmDomain;
  /** 'ANKLE' */
  plate: string;
  /** 'The Lunge' */
  test: string;
  icon: string;
  /** One line: what the test measures. */
  measures: string;
  /** Why it matters on the trail (climbs, descents, rough ground). */
  trail: string[];
  /** The injury link, said honestly. */
  injury: string;
  /** How to build it: 10 minutes, 3 times a week. */
  build: string[];
  /** In the gym over winter, and after ski days. */
  winter: string[];
  /** When to stop. */
  careful: string;
}

export function plateGuides(config: Config): PlateGuide[] {
  const seats = config.arm.throneSeatsCm;
  return [
    {
      domain: 'ankle',
      plate: 'ANKLE',
      test: 'The Lunge',
      icon: '🦶',
      measures: 'How far your knee can go forward past your toes with your heel flat: how much your ankle bends.',
      trail: [
        'Every climb needs it. On a steep path your shin must tilt forward over your foot. A stiff ankle lifts your heel early, so your stride gets short and your calf and Achilles do extra work.',
        'On rocks, roots and downhills, a bendy ankle lets your foot settle on uneven ground instead of rolling over.',
      ],
      injury: 'Stiff ankles are linked with ankle sprains, and with pain just below the kneecap in young athletes who jump and run a lot.',
      build: ['Knee-to-wall rocks: 10 slow rocks each leg, every day (after brushing your teeth works).', 'Calf stretch on a step: 30 s with the knee straight, 30 s with it bent, each leg.', 'Level 4–5 is plenty. Never force the stretch.'],
      winter: ['Ski boots lock your ankle all day: do 10 knee-to-wall rocks each leg after every ski day.', 'Gym: hold the bottom of a goblet squat for 20 s, heels down, 3 times.'],
      careful: 'A stretch should feel like a pull in the calf, never a pinch at the front of the ankle.',
    },
    {
      domain: 'calf',
      plate: 'CALF',
      test: 'The Wall',
      icon: '🦵',
      measures: 'How many full heel raises one leg can do in time with a 60 bpm beat: strength and stamina in your calf and Achilles.',
      trail: [
        'Your calf pushes you off the ground on every step, thousands of times a run, and it works harder uphill.',
        'When your calves tire, your stride gets short and sloppy at the end of a race, just when the last climb comes.',
        'Strong calves hold your ankle steady when you land on a rock or a root.',
      ],
      injury: 'Calves that tire quickly are linked with shin splints and Achilles pain in runners. Tendons get stronger slowly, with steady work, so start now.',
      build: [
        'Single-leg heel raises on a step: up on one beat, down on the next (60 bpm). 3 sets, stop 2–3 reps before you have to.',
        'Do one set with the knee slightly bent: it trains the deep calf muscle (soleus) that works most when you run.',
        `Can do 3 × 25? Add a backpack. The Wall counts up to ${config.arm.calfRepCap}.`,
      ],
      winter: ['Gym: heel raises on the Smith machine or seated calf machine, 3 × 12, slow down.', 'Ski days: 3 × 20 pogo hops and 3 × 15 single-leg heel raises (the ski-boot antidote).'],
      careful: 'Achilles or heel pain that gets worse while you exercise: stop and tell the coach.',
    },
    {
      domain: 'control',
      plate: 'CONTROL',
      test: 'The Throne',
      icon: '🪑',
      measures: `How well you lower and stand up on one leg with your kneecap pointing at your middle toes. Each level is a lower seat: ${seats.map((h, i) => `T${i + 1} ${h} cm`).join(', ')}.`,
      trail: [
        'Every running step is a quick one-leg squat. Climbing is one-leg step-ups again and again: your thigh and hip lift your whole body.',
        'Downhill, each landing is caught on one bent leg. Control keeps the knee in line when you are tired at the bottom of a long descent, and strong thighs mean less soreness the next day.',
        'Runners who add strength work like this usually run more economically: the same pace costs less energy, which shows most on long climbs.',
      ],
      injury: 'A knee that caves inward on a one-leg squat is linked with front-of-knee pain, and in girls with knee ligament injuries. Warm-ups that train this control cut knee injuries in youth sport.',
      build: [
        'Use a solid chair with no wheels, pushed against a wall. 3 times a week.',
        'Step 1: sit down on two legs in 3 seconds, stand up. 5 times.',
        'Step 2: sit down on ONE leg in 3 seconds, stand up on two. 5 each leg.',
        'Step 3: down and up on one leg, other foot off the floor. 3 each leg. Move up when every rep is smooth and pain-free.',
      ],
      winter: ['Gym: rear-foot-elevated split squats, 3 × 8 each leg. Step-downs off a box, slow, kneecap over the middle toes.', 'Watch your knee in a mirror: it points at your middle toes, never caves in.'],
      careful: 'Front-of-knee or heel pain: skip the Throne today and tell the coach. Skipping is smart training, not a fail.',
    },
  ];
}

/** The big picture, in five lines. */
export function armWhy(): string[] {
  return [
    'ARM is your armour: the strength and bend in your feet, calves and legs that lets them take the pounding of trail running.',
    'It does not make you faster this week. It lets you train and race more weeks without getting hurt, climb stronger and come down hills safely.',
    'Three plates, each tested on your weaker leg, because an injury usually starts on the weaker side.',
    'ARM is also one of your six card stats, so it counts in your OVR.',
  ];
}

/** How ARM is worked out, with the lookup strip from the sheet (sum of the three levels → ARM). */
export function armHowWorkedOut(config: Config): { lines: string[]; lookup: { sum: number; arm: number }[] } {
  const lookup = [];
  // Only the sum matters, so any split of it gives the same ARM.
  for (let sum = 3; sum <= 15; sum++) lookup.push({ sum, arm: armScoreClamped({ ankle: sum - 2, calf: 1, control: 1 }, config) });
  return {
    lines: [
      'Each plate gets a level from 0 to 5 on your weaker leg. Level 0 means you are not at level 1 yet: that is your first target.',
      'Add your three levels. 3 → ARM 40, 15 → ARM 99. You need at least level 1 on every plate to unlock ARM.',
      `The best level on each plate from the last ${config.arm.windowMonths} months counts, so a bad day never lowers your ARM.`,
      config.arm.interim.enabled
        ? `Tested before the Throne existed? Your control level may be an interim T${config.arm.interim.level} from the hop (both legs past ${config.arm.interim.hopCm} cm). It is marked *, and your first Throne test replaces it, up or down.`
        : '',
    ].filter(Boolean),
    lookup,
  };
}

/** Keeping and protecting your armour, especially over winter. */
export function armKeep(config: Config): string[] {
  return [
    '10 minutes, 3 times a week builds it. Once or twice a week keeps it over a break, as long as the work stays hard (slow, controlled, close to your limit).',
    `Winter in the gym: once a week, 3 rounds of heel raises (straight and bent knee), split squats or step-downs, ${config.arm.plate3 === 'control' ? 'one-leg sit-downs, ' : ''}knee-to-wall rocks and pogo hops. It counts as a Winter Mode armour session.`,
    'Ski days take the work away from your calves and ankles. Do the ski-boot antidote afterwards.',
    'Sharp pain means stop. Heel or front-of-knee pain means skip the hop and the Throne and tell the coach: growing bones need a person, not an app.',
    'Retest the same way every time: same box, same beat, same judge. Honest scores only.',
  ];
}

export interface PlateAdvice {
  domain: ArmDomain;
  plate: string;
  test: string;
  level?: number;
  interim?: boolean;
  /** 'Next: 20 reps (level 2)'; undefined at level 5. */
  next?: string;
  /** The first thing to do. */
  doThis: string;
}

/** Personal advice: each plate's level, the next target, one thing to do; weakest plate first. */
export function plateAdvice(levels: ArmLevels, config: Config): PlateAdvice[] {
  const guides = plateGuides(config);
  const out = ARM_DOMAINS.map((d): PlateAdvice => {
    const g = guides.find((x) => x.domain === d)!;
    const level = levels[d];
    const target = nextLevelTarget(d, level, config);
    const nextLevel = (level ?? 0) + 1;
    return {
      domain: d,
      plate: config.arm.plate3 === 'balance' && d === 'control' ? 'BALANCE' : g.plate,
      test: config.arm.plate3 === 'balance' && d === 'control' ? 'The Stork' : g.test,
      level,
      interim: d === 'control' && levels.controlInterim,
      next: target ? `Next: ${d === 'control' && config.arm.plate3 === 'control' ? target : `${target} (level ${nextLevel})`}` : undefined,
      doThis: level == null ? `Not tested yet: ${g.test} is your next step.` : g.build[d === 'control' ? Math.min(3, Math.max(1, level)) : 0],
    };
  });
  // Weakest first (untested counts as weakest), keeping plate order on ties.
  return out.sort((a, b) => (a.level ?? -1) - (b.level ?? -1));
}

export { plateName, throneLabel };
