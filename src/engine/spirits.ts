// 獣道 Kemonomichi ("animal trail": the paths animals wear through the mountains, the first trails
// anyone ever ran). Each of the six stats has a spirit animal from Japan's wild places, the RACE rating has
// the troop, and two more stand for rest and for coming back. Pure data and words: nothing here changes a
// rating. The pictures are in src/ui/art/Spirits.tsx.
import type { RatingKey, StatKey } from './types';
import { STAT_KEYS } from './types';

export type SpiritId = 'falcon' | 'eagle' | 'serow' | 'pika' | 'owl' | 'panda' | 'monkey' | 'dugong' | 'rabbit';

export interface Spirit {
  id: SpiritId;
  name: string;
  /** Japanese name, for flavour. */
  jp: string;
  /** The rating it stands for; rest and comeback stand for no rating. */
  stat?: RatingKey;
  /** One word for what it brings to a runner. */
  gift: string;
  /** Where it lives. */
  home: string;
  /** Short, true facts (checked against field guides and the Ministry of the Environment). */
  facts: string[];
  /** Why it is this stat's spirit, in one line for a pupil. */
  why: string;
}

export const SPIRITS: Record<SpiritId, Spirit> = {
  falcon: {
    id: 'falcon',
    name: 'Peregrine falcon',
    jp: 'ハヤブサ',
    stat: 'SPD',
    gift: 'Speed',
    home: 'Sea cliffs and mountain crags all over Japan',
    facts: [
      'The fastest animal on Earth: in a hunting dive it has been timed at well over 300 km/h.',
      'The Hayabusa bullet train that runs north through Iwate is named after it.',
      'It folds its wings back into a teardrop to cut through the air.',
    ],
    why: 'SPD is how fast you can go when it counts. Short, sharp, relaxed: like a falcon folding its wings.',
  },
  eagle: {
    id: 'eagle',
    name: "Steller's sea eagle",
    jp: 'オオワシ',
    stat: 'END',
    gift: 'Endurance',
    home: 'The coasts of the Sea of Okhotsk; winters in Hokkaido',
    facts: [
      'One of the heaviest eagles in the world: a big female can weigh about 9 kg.',
      'Every winter many fly from Kamchatka and the Okhotsk coast to Hokkaido, and back again in spring.',
      'Its huge orange beak is the largest of any eagle.',
    ],
    why: 'END is going the distance. The great eagle crosses a sea every winter, one steady wingbeat at a time.',
  },
  serow: {
    id: 'serow',
    name: 'Japanese serow',
    jp: 'カモシカ',
    stat: 'CLB',
    gift: 'Climbing',
    home: 'Steep forest and crags in the mountains of Honshu, including Iwate',
    facts: [
      'A goat-antelope found only in Japan, and a Special Natural Monument.',
      'Lives on slopes so steep that people need their hands, and walks up them calmly.',
      'You might meet one on the trails around Appi: stand still and it often stares right back.',
    ],
    why: 'CLB is going uphill well. The serow climbs like it has all day: short steps, steady breath, never in a panic.',
  },
  pika: {
    id: 'pika',
    name: 'Pika',
    jp: 'ナキウサギ',
    stat: 'DSC',
    gift: 'Descent',
    home: 'Boulder fields high in the mountains of Hokkaido',
    facts: [
      'A cousin of rabbits, about the size of your fist, left behind in the mountains since the Ice Age.',
      'Darts across loose boulders and scree with quick, light steps.',
      'Does not hibernate: all summer it gathers grass into hay piles to eat in winter.',
    ],
    why: 'DSC is coming down fast and safely. Quick light feet, eyes ahead, never stuck on one rock: pure pika.',
  },
  owl: {
    id: 'owl',
    name: "Blakiston's fish owl",
    jp: 'シマフクロウ',
    stat: 'NAV',
    gift: 'Navigation',
    home: 'Old forest rivers in eastern Hokkaido',
    facts: [
      'One of the largest owls in the world, and one of the rarest birds in Japan.',
      'Hunts fish in dark rivers at night, finding its way by sight and sound.',
      'The Ainu people call it Kotan kor kamuy: the god who watches over the village.',
    ],
    why: 'NAV is knowing where you are. The fish owl reads the river in the dark; you read the map and the land.',
  },
  panda: {
    id: 'panda',
    name: 'Red panda',
    jp: 'レッサーパンダ',
    stat: 'ARM',
    gift: 'Armour',
    home: 'Mountain bamboo forests of the Himalaya; a favourite in Japanese zoos',
    facts: [
      'Its ankles turn so far that it can climb down a tree head first.',
      'Fur on the soles of its feet grips snow and ice and keeps them warm.',
      'Balances on thin branches high above the ground, all day long.',
    ],
    why: 'ARM is your ankles, calves and balance: the armour that keeps you upright on roots, rocks and snow. Nobody has better ankles than a red panda.',
  },
  monkey: {
    id: 'monkey',
    name: 'Snow monkey',
    jp: 'ニホンザル',
    stat: 'RACE',
    gift: 'Racing',
    home: 'Snowy mountain forests of Tohoku and Nagano',
    facts: [
      'Lives further north than any other monkey in the world (people apart).',
      'Gets through winters of deep snow, and some troops warm up in hot springs.',
      'Lives in troops that look after each other: nobody faces the winter alone.',
    ],
    why: 'RACE is what you do on the big days, with your team. Like a troop, an ekiden squad gets through it together.',
  },
  dugong: {
    id: 'dugong',
    name: 'Dugong',
    jp: 'ジュゴン',
    gift: 'Rest',
    home: 'Warm seagrass meadows; Japan is the northern edge of its world, around Okinawa',
    facts: [
      'A gentle grazer of seagrass, and a distant cousin of the elephant.',
      'Moves slowly, rests often, and has done fine like that for millions of years.',
      'It surfaces to breathe every few minutes, then sinks back down to graze.',
    ],
    why: 'Rest is part of training. Holiday weeks and rest weeks are dugong weeks: your trail waits for you.',
  },
  rabbit: {
    id: 'rabbit',
    name: 'Amami rabbit',
    jp: 'アマミノクロウサギ',
    gift: 'Comeback',
    home: 'Two small islands only: Amami-Ōshima and Tokunoshima',
    facts: [
      'An ancient kind of rabbit with short ears, found nowhere else on Earth.',
      'Mongooses brought to Amami nearly wiped it out. After 30 years of work the island was declared free of them in 2024, and the rabbits came back.',
      'A Special Natural Monument of Japan.',
    ],
    why: 'Missed a week? Everyone does. The Amami rabbit nearly vanished and came back. So can your trail: one run starts it again.',
  },
};

/** Stat names in words (as on the card's 'Why?' sheets). */
export const STAT_LONG: Record<RatingKey, string> = { SPD: 'Speed', END: 'Endurance', CLB: 'Climb', DSC: 'Descent', NAV: 'Navigation', ARM: 'Armour', RACE: 'Race' };

export const STAT_SPIRIT: Record<RatingKey, SpiritId> = {
  SPD: 'falcon',
  END: 'eagle',
  CLB: 'serow',
  DSC: 'pika',
  NAV: 'owl',
  ARM: 'panda',
  RACE: 'monkey',
};

/** The six stat spirits in card order. */
export const STAT_SPIRITS: SpiritId[] = STAT_KEYS.map((k) => STAT_SPIRIT[k]);

/** The spirits a runner can walk with: one per stat, plus the troop. */
export const COMPANIONS: SpiritId[] = [...STAT_SPIRITS, 'monkey'];

export function isSpiritId(s: unknown): s is SpiritId {
  return typeof s === 'string' && s in SPIRITS;
}

/**
 * A runner's default companion: the spirit of their strongest unlocked stat (ties go to card order), or the
 * serow, the trail guide of the Appi mountains, for a runner with nothing unlocked yet.
 */
export function defaultCompanion(stats: Partial<Record<StatKey, { locked: boolean; value?: number }>>): SpiritId {
  let best: StatKey | undefined;
  for (const k of STAT_KEYS) {
    const s = stats[k];
    if (!s || s.locked || s.value == null) continue;
    if (best == null || s.value > (stats[best]!.value ?? 0)) best = k;
  }
  return best ? STAT_SPIRIT[best] : 'serow';
}

/** A stable pick from a list for a given day (so a line does not change on every render, but does day to day). */
export function pickForDay<T>(items: readonly T[], dayKey: string, salt = 0): T {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < dayKey.length; i++) h = Math.imul(h ^ dayKey.charCodeAt(i), 16777619);
  return items[Math.abs(h) % items.length];
}

/** Trail lore: where running comes from. Short, sourced, and shown one at a time on the Trail page. */
export const LORE: { title: string; text: string }[] = [
  { title: 'Born to run', text: 'Humans are built for distance: springy Achilles tendons, big bottom muscles that steady each stride, and sweat to stay cool. Some scientists think our ancestors ran animals down over hours in the heat (Bramble & Lieberman, Nature, 2004).' },
  { title: 'The first trails', text: 'Long before roads, people followed kemonomichi (獣道): the paths animals wear through forests and over passes. Every trail you run started as one.' },
  { title: 'The first ekiden', text: 'In April 1917 relay teams ran from Kyoto to Tokyo along the old Tōkaidō road, about 500 km over three days, passing a sash from runner to runner. The tasuki on your card is that sash.' },
  { title: 'Runners of the canyons', text: "The Rarámuri people of Mexico's Copper Canyon are famous for running huge distances over rough mountain trails, often in simple sandals, and for races where teams kick a wooden ball for many kilometres." },
  { title: 'The mountain monks', text: 'On Mount Hiei near Kyoto, a few monks of the Tendai school take on the kaihōgyō: walking and running mountain paths for 1,000 days over seven years.' },
  { title: 'Small steps uphill', text: 'Animals that live on steep slopes, like the serow, do not leap up them: they take short, steady steps. Trail runners do the same, and walk the steepest bits with hands on knees.' },
  { title: 'Eyes ahead', text: 'Going downhill, good runners look 3–4 metres ahead, not at their feet. Your brain plans the next few steps while your feet do the current one.' },
  { title: 'Rest makes you fitter', text: 'Training breaks your body down a little; rest is when it builds back stronger. That is why the trail never punishes a holiday week.' },
];
