// The weekly Teams post for the Winter Ekiden (spec §10). Pure. Templates live in config.winter.postTemplates.
// Rules: never mention how many did not train, never use a share of the roster, never report low numbers. So
// the post only ever counts cards done and km travelled, and when this week's cards are fewer than last week's
// (or none) it is built on the team total instead.
import type { Config } from './config';
import type { TeamEkiden } from './white';
import { ekidenPosition, km1 } from './white';

export interface PostValues {
  cardsWeek: number;
  kmWeek: number;
  kmTotal: number;
  leg: number;
  nextStation: string;
  kmToNext: number;
  thawCount: number;
  thawNames: string;
}

const PLACEHOLDER = /\{(\w+)\}/g;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Fill {placeholders}; unknown ones are left as written. */
export function fillTemplate(t: string, v: PostValues): string {
  return t.replace(PLACEHOLDER, (m, k: string) => (k in v ? String(v[k as keyof PostValues]) : m)).replace(/\s+/g, ' ').trim();
}

/**
 * The post for week index `weekIndex` (0-based position of the week in the season, for the rotation).
 * Returns undefined when no template fits (e.g. no templates).
 */
export function weeklyPost(v: PostValues, lastWeekCards: number | undefined, weekIndex: number, config: Config): { text: string; template: string; usedTotal: boolean } | undefined {
  const w = config.winter;
  const usedTotal = v.cardsWeek === 0 || (lastWeekCards != null && v.cardsWeek < lastWeekCards);
  const pool = usedTotal && w.postTotalTemplates.length ? w.postTotalTemplates : w.postTemplates;
  const n = pool.length;
  for (let k = 0; k < n; k++) {
    const t = pool[(((weekIndex + k) % n) + n) % n];
    const used = [...t.matchAll(PLACEHOLDER)].map((m) => m[1]);
    // Comeback Thaw templates need a thaw to celebrate; total-based posts never quote the weekly count.
    if (v.thawCount === 0 && (used.includes('thawCount') || used.includes('thawNames'))) continue;
    if (usedTotal && (used.includes('cardsWeek') || used.includes('kmWeek'))) continue;
    const text = fillTemplate(t, v);
    if (words(text) <= w.postMaxWords) return { text, template: t, usedTotal };
  }
  return undefined;
}

/** Placeholder values for a week of the team board. `names` turns runner ids into display names. */
export function postValues(team: TeamEkiden, weekIdx: number, names: (id: string) => string, config: Config): PostValues {
  const wk = team.weeks[weekIdx];
  const pos = wk ? ekidenPosition(wk.totalKm, config.winter.route) : team.position;
  const thaws = wk?.thaws ?? [];
  return {
    cardsWeek: wk?.cards ?? 0,
    kmWeek: km1(wk?.km ?? 0),
    kmTotal: km1(wk?.totalKm ?? team.totalKm),
    leg: pos.leg,
    nextStation: pos.finished ? 'the finish (done!)' : pos.next.name,
    kmToNext: pos.kmToNext,
    thawCount: thaws.length,
    thawNames: thaws.map(names).join(', '),
  };
}
