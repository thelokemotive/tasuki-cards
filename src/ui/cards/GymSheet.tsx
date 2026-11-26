// The paper Gym Log sheet: A4 landscape, one sheet per counted week, up to 40 runners a page in two halves of
// 20, boxes 16 × 8 mm so handwriting reads in a phone photo. No ratings, streaks or freeze history.
import './gymSheet.css';
import type { ISOWeek } from '../../types';
import type { Config } from '../../engine/config';
import { GYM_SHEET_FOOTER, gymSheetDays, gymSheetLegend, gymSheetPages, gymSheetTitle, type GymSheetRow } from '../../engine/gymSheet';

/** Long names step down in size so they are never cut off (the year-group tag takes room on a group's first row). */
function nameClass(label: string, tag: string | undefined): string {
  const len = [...label].length + (tag ? tag.length + 1.5 : 0);
  return len > 24 ? ' gs-longest' : len > 19 ? ' gs-longer' : len > 15 ? ' gs-long' : '';
}

function Half({ rows, week }: { rows: GymSheetRow[]; week: ISOWeek }) {
  const days = gymSheetDays(week);
  return (
    <table className="gs-table">
      <colgroup>
        <col className="gs-col-name" />
        {days.map((d) => (
          <col key={d.day} className="gs-col-day" />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th className="gs-name-h">Name</th>
          {days.map((d) => (
            <th key={d.day} className={d.day === 'Sat' || d.day === 'Sun' ? 'gs-weekend' : undefined}>
              <span className="gs-day">{d.day}</span> <span className="gs-date">{d.label}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const first = i === 0 || rows[i - 1].yearGroup !== r.yearGroup;
          return (
            <tr key={r.athleteId} className={first && i > 0 ? 'gs-group' : undefined} data-athlete={r.athleteId}>
              <td className={`gs-name${nameClass(r.label, first ? r.yearGroup : undefined)}`}>
                {first && <span className="gs-yg">{r.yearGroup}</span>}
                <span className="gs-label">{r.label}</span>
              </td>
              {days.map((d) => (
                <td key={d.day} className={d.day === 'Sat' || d.day === 'Sun' ? 'gs-weekend' : undefined} />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function GymSheets({ rows, weeks, config }: { rows: GymSheetRow[]; weeks: ISOWeek[]; config: Config }) {
  const { legend, example } = gymSheetLegend(config);
  const pages = gymSheetPages(rows);
  return (
    <div className="gym-sheets">
      {weeks.flatMap((week) =>
        pages.map((halves, pi) => (
          <section key={`${week}-${pi}`} className="gym-page" data-week={week}>
            <header className="gs-header">
              <h1>
                {gymSheetTitle(week)}
                {pages.length > 1 && <span className="gs-pageno"> · page {pi + 1} of {pages.length}</span>}
              </h1>
              <span className="gs-slogan">{config.winter.slogan}</span>
            </header>
            <div className="gs-halves">
              {halves.map((h, hi) => (
                <Half key={hi} rows={h} week={week} />
              ))}
            </div>
            <div className="gs-legend">
              {legend}
              {example && <strong> · e.g. {example}</strong>}
            </div>
            <footer className="gs-footer">{GYM_SHEET_FOOTER}</footer>
          </section>
        )),
      )}
    </div>
  );
}
