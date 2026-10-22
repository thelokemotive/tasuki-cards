// Live preview of what a draft change would do to one athlete (Quick Entry: "SPD 71 → 74, new PB −9 s, In-Form").
import type { DataSnapshot, ISODate } from '../../types';
import type { Config } from '../../engine/config';
import { deriveAll, diffRatings, type Derived } from '../../engine/derive';
import { applyChanges, type Changes } from '../../store/changes';
import { formatDelta } from '../../engine/format';

export interface PreviewLine {
  text: string;
  tone: 'up' | 'down' | 'info' | 'warn';
}

export function previewChanges(snapshot: DataSnapshot, before: Derived, changes: Changes, athleteId: string, asOf: ISODate, config: Config): PreviewLine[] {
  const after = deriveAll(applyChanges(snapshot, changes), asOf, config);
  const lines: PreviewLine[] = [];
  const diffs = diffRatings(before, after).filter((d) => d.athleteId === athleteId);
  for (const d of diffs) {
    if (d.before == null && d.after != null) lines.push({ text: `${d.stat} unlocked: ${d.after}`, tone: 'up' });
    else if (d.before != null && d.after == null) lines.push({ text: `${d.stat} locks`, tone: 'down' });
    else lines.push({ text: `${d.stat} ${d.before} → ${d.after}`, tone: d.delta > 0 ? 'up' : 'down' });
  }
  const b = before.athletes.get(athleteId);
  const a = after.athletes.get(athleteId);
  if (a) {
    const oldKeys = new Map((b?.pbs ?? []).map((p) => [p.key, p]));
    for (const pb of a.pbs) {
      const old = oldKeys.get(pb.key);
      if (old && old.perfId === pb.perfId) continue;
      if (!old) lines.push({ text: `first ${pb.label} result`, tone: 'info' });
      else if (pb.measure === 'time') lines.push({ text: `new PB ${formatDelta(pb.value - old.value)} on ${pb.label}`, tone: 'up' });
      else lines.push({ text: `new PB +${Math.round((pb.value - old.value) * 10) / 10} (${pb.label})`, tone: 'up' });
    }
    if (a.inForm.length && !(b?.inForm.length)) lines.push({ text: 'In-Form', tone: 'up' });
    if (b && a.ratings.tier !== b.ratings.tier) lines.push({ text: `tier ${b.ratings.tier} → ${a.ratings.tier}`, tone: 'up' });
    if (b && a.streak.currentStreak !== b.streak.currentStreak) lines.push({ text: `streak ${b.streak.currentStreak} → ${a.streak.currentStreak}`, tone: 'info' });
    const newBadges = a.badges.filter((x) => !(b?.badges ?? []).some((y) => y.key === x.key));
    for (const nb of newBadges) lines.push({ text: `badge: ${nb.label}`, tone: 'up' });
  }
  if (!lines.length) lines.push({ text: 'No rating changes (the result is saved to the athlete’s history).', tone: 'info' });
  return lines;
}
