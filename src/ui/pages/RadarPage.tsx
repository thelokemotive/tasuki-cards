// Coach radar (spec §7): who needs a quiet word this week. Coach-only: never projected or printed for display.
import { useMemo, useState } from 'react';
import { fullName } from '../../engine/display';
import { formatLongDate, formatShortDate, isoWeek, weekMonday } from '../../engine/dates';
import { seasonWeeks, whiteRadar, type WhiteSummary } from '../../engine/white';
import { Empty, PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { useToast } from '../components/Toast';
import { Link } from '../router';

function Section({ title, hint, names, children }: { title: string; hint: string; names: string[]; children?: React.ReactNode }) {
  const toast = useToast();
  const copy = async () => {
    const text = [...new Set(names)].join(', ');
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${new Set(names).size} name${new Set(names).size === 1 ? '' : 's'}.`, 'ok');
    } catch {
      window.prompt('Copy the names:', text);
    }
  };
  return (
    <Panel
      title={`${title} (${new Set(names).size})`}
      actions={
        <button className="btn btn-sm" disabled={!names.length} onClick={copy}>
          Copy names
        </button>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>{hint}</p>
      {names.length === 0 ? <p className="small muted">Nobody.</p> : children ?? <p>{[...new Set(names)].join(', ')}</p>}
    </Panel>
  );
}

export function RadarPage() {
  const { derived, config, snapshot, asOf: today, commit } = useData();
  const season = config.winter.season;
  const weeks = seasonWeeks(season).filter((w) => w <= isoWeek(today));
  const def = [...weeks].reverse().find((w) => w < isoWeek(today)) ?? weeks.at(-1);
  const [picked, setPicked] = useState<string | undefined>();
  const week = picked ?? def;
  const summaries = useMemo(() => [...derived.athletes.values()].map((d) => d.white).filter((x): x is WhiteSummary => !!x), [derived]);
  const athletes = snapshot.athletes;
  const name = (id: string) => {
    const a = athletes.find((x) => x.id === id);
    return a ? fullName(a) : id;
  };
  const cardName = (code: string) => config.winter.cards.find((c) => c.code === code)?.name ?? code;
  const radar = week ? whiteRadar(summaries, athletes, config, week) : undefined;
  const unmatched = snapshot.meta.gymUnmatched ?? [];

  if (!week || !radar) {
    return (
      <div className="stack">
        <PageHeader title="Coach radar" subtitle="Who needs a quiet word. Coach only." />
        <Panel>
          <Empty title="White Season has not started">
            <p>The radar starts on {formatLongDate(season.start)}.</p>
          </Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack no-print-page">
      <PageHeader
        title="Coach radar"
        subtitle="Coach only: never project or print this page. Have a quiet word with anyone listed."
        actions={
          <label className="small">
            Week{' '}
            <select className="select" style={{ width: 'auto' }} value={week} onChange={(e) => setPicked(e.target.value)}>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {formatLongDate(weekMonday(w))}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <Section title="Something hurt (“!”)" hint="Every entry marked “!” this week. Check in, and rest it." names={radar.hurt.map((h) => name(h.athleteId))}>
        <table className="table">
          <thead>
            <tr>
              <th>Runner</th>
              <th>Date</th>
              <th>Card</th>
            </tr>
          </thead>
          <tbody>
            {radar.hurt.map((h, i) => (
              <tr key={i}>
                <td>
                  <Link to={`/athlete/${h.athleteId}`}>{name(h.athleteId)}</Link>
                </td>
                <td>{formatShortDate(h.date)}</td>
                <td>
                  {cardName(h.card)}
                  {h.tier ? ` · ${config.winter.tierNames[h.tier - 1] ?? h.tier}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`No credited session in the last ${config.winter.radarQuietWeeks} counted weeks`} hint="Coach and medical freezes are left out." names={radar.quiet.map(name)} />
      <Section
        title={`${config.winter.radarSessionsFlag}+ sessions logged this week`}
        hint="A check for compulsive training: more than the weekly cap earns nothing, and rest is training too."
        names={radar.many.map((m) => name(m.athleteId))}
      >
        <p>{radar.many.map((m) => `${name(m.athleteId)} (${m.logged})`).join(', ')}</p>
      </Section>
      <Section title={`${config.winter.tierNames[2] ?? 'Summit'} logged without a pass`} hint="Tier 3 needs a Summit pass (▲). Give one with “# summit” in Paste & Match, or on the athlete page." names={radar.summitNoPass.map((x) => name(x.athleteId))}>
        <p>{radar.summitNoPass.map((x) => `${name(x.athleteId)} (${formatShortDate(x.date)}, ${x.card}${x.tier})`).join(', ')}</p>
      </Section>
      <Section title="Self-RF allowance used up this half-term" hint={`${config.winter.selfRfPerHalfTerm} recovery weeks per half-term. A further RF is stored but the week counts as if there were no freeze.`} names={radar.rfUsedUp.map(name)} />
      <Section title="Holiday Form entries that could not be matched" hint="Import them again after adding the runner or an alias, then dismiss." names={unmatched.map((u) => u.name)}>
        <table className="table">
          <thead>
            <tr>
              <th>Name on the Form</th>
              <th>Email</th>
              <th>Date</th>
              <th>Card</th>
            </tr>
          </thead>
          <tbody>
            {unmatched.map((u) => (
              <tr key={u.key}>
                <td>{u.name}</td>
                <td className="small">{u.email}</td>
                <td>{u.date ? formatShortDate(u.date) : '—'}</td>
                <td>{u.card ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => commit({ meta: { ...snapshot.meta, gymUnmatched: [] } })}>
          Dismiss all
        </button>
      </Section>
    </div>
  );
}
