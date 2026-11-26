// Print studio (spec 5): choose cards (all, In-Form this week, a year group, or hand-picked) and print
// A4 portrait sheets of 3 × 3 with crop marks. Print at 100% scale. Printed cards never show DOB or
// provisional markers.
import { useMemo, useState } from 'react';
import type { YearGroup } from '../../types';
import { YEAR_GROUPS } from '../../types';
import { Empty, PageHeader, Panel, Seg } from '../components/common';
import { useData } from '../data/DataContext';
import { navigate, useRoute } from '../router';
import { buildCardData } from '../cards/cardData';
import { PrintSheets, CARDS_PER_SHEET } from '../cards/PrintSheet';
import { fullName } from '../../engine/display';
import { GymSheets } from '../cards/GymSheet';
import { gymSheetPages, gymSheetRows, gymSheetWeeks, type GymSheetRow } from '../../engine/gymSheet';
import { seasonWeeks, whiteWeekKind } from '../../engine/white';
import { formatLongDate, isoWeek, weekMonday } from '../../engine/dates';

/** What to print: trading cards, or the White Season Gym Log sheet. */
function StudioSwitch({ value }: { value: 'cards' | 'gym' }) {
  return (
    <Seg<'cards' | 'gym'>
      value={value}
      onChange={(v) => navigate(v === 'gym' ? '/cards?sheet=gym' : '/cards')}
      options={[
        { value: 'cards', label: 'Trading cards' },
        { value: 'gym', label: 'Gym Log sheet (White Season)' },
      ]}
    />
  );
}

/** Gym Log sheets for a range of counted weeks (holiday weeks are skipped). `?sample=45` previews with sample names. */
function GymSheetStudio() {
  const { snapshot, config, today } = useData();
  const route = useRoute();
  const season = config.winter.season;
  const terms = seasonWeeks(season).filter((w) => whiteWeekKind(w, season) === 'term');
  const next = terms.find((w) => w >= isoWeek(today)) ?? terms[0];
  const [from, setFrom] = useState<string>(next ?? '');
  const [to, setTo] = useState<string>(next ?? '');
  const sample = Number(route.query.get('sample') ?? 0);
  const rows: GymSheetRow[] = useMemo(
    () => (sample > 0 ? Array.from({ length: Math.min(200, sample) }, (_, i) => ({ athleteId: `sample-${i}`, yearGroup: (['Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12', 'Y13'] as const)[Math.floor((i * 7) / sample)], label: `Testrunner${i + 1} W.${i % 5 === 0 ? ' ▲' : ''}` })) : gymSheetRows(snapshot.athletes)),
    [sample, snapshot.athletes],
  );
  const weeks = from && to ? gymSheetWeeks(config, weekMonday(from <= to ? from : to), weekMonday(from <= to ? to : from)) : [];
  const pages = weeks.length * gymSheetPages(rows).length;
  return (
    <div className="stack">
      <div className="no-print stack">
        <PageHeader
          title="Cards & Print Studio"
          subtitle="Gym Log sheet: one A4 landscape sheet per counted week (holiday weeks are skipped), up to 40 runners a page. In the print dialog choose A4, landscape, scale 100% and tick “Background graphics”."
          actions={
            <button className="btn btn-primary btn-lg" disabled={!pages || !rows.length} onClick={() => window.print()} data-testid="print-gym">
              Print {pages} sheet{pages === 1 ? '' : 's'}
            </button>
          }
        />
        <Panel>
          <div className="row">
            <StudioSwitch value="gym" />
            <label className="small">
              From{' '}
              <select className="select" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="gym-from">
                {terms.map((w) => (
                  <option key={w} value={w}>
                    {formatLongDate(weekMonday(w))}
                  </option>
                ))}
              </select>
            </label>
            <label className="small">
              to{' '}
              <select className="select" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} data-testid="gym-to">
                {terms.map((w) => (
                  <option key={w} value={w}>
                    {formatLongDate(weekMonday(w))}
                  </option>
                ))}
              </select>
            </label>
            <span className="small muted">
              {rows.length} runner{rows.length === 1 ? '' : 's'} on the winter roster{sample > 0 ? ' (sample names)' : ''}. ▲ = Summit pass. Change the roster in Settings → White Season.
            </span>
          </div>
        </Panel>
      </div>
      {!rows.length ? (
        <Panel>
          <Empty title="Nobody on the winter roster">
            <p>Add runners in Settings → White Season.</p>
          </Empty>
        </Panel>
      ) : !weeks.length ? (
        <Panel>
          <Empty title="No counted weeks in that range">
            <p>Holiday weeks have no sheet. Check the season in Settings → White Season.</p>
          </Empty>
        </Panel>
      ) : (
        <GymSheets rows={rows} weeks={weeks} config={config} />
      )}
    </div>
  );
}

type Mode = 'all' | 'inform' | 'year' | 'pick';

export function PrintStudioPage() {
  const route = useRoute();
  if (route.query.get('sheet') === 'gym') return <GymSheetStudio />;
  return <CardStudio />;
}

function CardStudio() {
  const { derived } = useData();
  const route = useRoute();
  const sel = route.query.get('select') ?? 'all';
  const mode: Mode = sel.startsWith('year') ? 'year' : (['all', 'inform', 'pick'].includes(sel) ? sel : 'all') as Mode;
  const year = (route.query.get('year') as YearGroup) || 'Y7';
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const active = useMemo(
    () =>
      [...derived.athletes.values()]
        .filter((d) => d.athlete.active)
        .sort((a, b) => YEAR_GROUPS.indexOf(a.athlete.yearGroup) - YEAR_GROUPS.indexOf(b.athlete.yearGroup) || fullName(a.athlete).localeCompare(fullName(b.athlete))),
    [derived],
  );
  const chosen = active.filter((d) => (mode === 'all' ? true : mode === 'inform' ? d.inForm.length > 0 : mode === 'year' ? d.athlete.yearGroup === year : picked.has(d.athlete.id)));
  const cards = chosen.map(buildCardData);
  const setMode = (m: Mode) => navigate(`/cards?select=${m}${m === 'year' ? `&year=${year}` : ''}`);
  const sheets = Math.ceil(cards.length / CARDS_PER_SHEET);

  return (
    <div className="stack">
      <div className="no-print stack">
        <PageHeader
          title="Cards & Print Studio"
          subtitle="Trading cards are 63 × 88 mm, nine to an A4 sheet with crop marks. In the print dialog choose A4, portrait, scale 100% (Default margins are fine) and tick “Background graphics”."
          actions={
            <button className="btn btn-primary btn-lg" disabled={!cards.length} onClick={() => window.print()} data-testid="print">
              Print {cards.length} card{cards.length === 1 ? '' : 's'} ({sheets} sheet{sheets === 1 ? '' : 's'})
            </button>
          }
        />
        <Panel>
          <div className="row" style={{ marginBottom: 10 }}>
            <StudioSwitch value="cards" />
          </div>
          <div className="row">
            <Seg<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'all', label: `Everyone (${active.length})` },
                { value: 'inform', label: `In-Form this week (${active.filter((d) => d.inForm.length).length})` },
                { value: 'year', label: 'Year group' },
                { value: 'pick', label: 'Hand-pick' },
              ]}
            />
            {mode === 'year' && (
              <select className="select" style={{ width: 'auto' }} value={year} onChange={(e) => navigate(`/cards?select=year&year=${e.target.value}`)}>
                {YEAR_GROUPS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            )}
          </div>
          {mode === 'pick' && (
            <div className="row" style={{ marginTop: 12 }}>
              {active.map((d) => (
                <label key={d.athlete.id} className="check small" style={{ minWidth: 180 }}>
                  <input
                    type="checkbox"
                    checked={picked.has(d.athlete.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(d.athlete.id);
                      else next.delete(d.athlete.id);
                      setPicked(next);
                    }}
                  />
                  {fullName(d.athlete)} <span className="muted">{d.athlete.yearGroup}</span>
                </label>
              ))}
            </div>
          )}
        </Panel>
      </div>
      {cards.length === 0 ? (
        <Panel>
          <Empty title="No cards selected">{active.length === 0 ? <p>Import the roster first.</p> : <p>Choose who to print above.</p>}</Empty>
        </Panel>
      ) : (
        <PrintSheets cards={cards} />
      )}
    </div>
  );
}
