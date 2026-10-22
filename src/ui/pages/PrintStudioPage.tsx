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

type Mode = 'all' | 'inform' | 'year' | 'pick';

export function PrintStudioPage() {
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
