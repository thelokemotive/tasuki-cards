// Athlete page: the Green Long Ducker. Predicted time on this runner's course (from the Next-5K prediction,
// scaled to the course's distance and climb), where that puts them among the squad, and their past places.
import { useMemo } from 'react';
import { useData } from '../data/DataContext';
import type { AthleteDerived } from '../../engine/derive';
import { isGld, predictGldAll } from '../../engine/gld';
import { formatTime } from '../../engine/format';
import { Panel } from './common';

function ord(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export function GldPanel({ d }: { d: AthleteDerived }) {
  const { derived } = useData();
  const all = useMemo(() => predictGldAll([...derived.athletes.values()], derived.config, derived.asOf), [derived]);
  const p = all.get(d.athlete.id);
  const past = d.perfs
    .filter((x) => !x.deleted && x.place != null)
    .map((x) => ({ x, ev: x.eventId ? derived.lookup.events.get(x.eventId) : undefined }))
    .filter(({ ev }) => ev && isGld(ev.name))
    .sort((a, b) => (a.x.date < b.x.date ? 1 : -1));
  if (!p && !past.length) return null;
  const sexWord = d.athlete.sex === 'F' ? 'girls' : 'boys';
  return (
    <Panel title="Green Long Ducker">
      {p ? (
        <p>
          Predicted <strong className="num">{formatTime(Math.round(p.timeSec))}</strong> on the {p.course.name} ({p.course.distanceKm} km, +{Math.round(p.course.climbM ?? 0)} m).
          {p.squadRank != null && p.squadOf != null && p.squadOf > 1 && (
            <>
              {' '}
              That is {ord(p.squadRank)} of {p.squadOf} squad {sexWord} predicted on this course.
            </>
          )}
        </p>
      ) : (
        <p className="muted">No prediction yet: it needs a timed race or run for the Next 5K.</p>
      )}
      {past.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {past.map(({ x, ev }) => (
            <li key={x.id}>
              {ev!.name}: {ord(x.place!)}
              {x.fieldSize ? ` of ${x.fieldSize} (top ${Math.max(1, Math.round((x.place! / x.fieldSize) * 100))}%)` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="tiny muted" style={{ marginTop: 6 }}>
        The prediction scales the Next 5K to the course's distance plus climb (each 100 m of climb counts as 1 km). Places come from the whole-school results.
      </p>
    </Panel>
  );
}
