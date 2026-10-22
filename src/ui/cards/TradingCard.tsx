// The Tasuki trading card (spec 5): 63 × 88 mm, laid out entirely in mm so screen and print match.
// Original design: a vertical card crossed by a diagonal tasuki sash. Locked stats show a lock and a
// short hint, never a number. Provisional markers appear only in the coach view (never in print).
import './card.css';
import type { CSSProperties } from 'react';
import type { CardData, CardStat } from './cardData';
import { STAT_NAMES } from './cardData';
import { AvatarSvg } from '../avatar/AvatarSvg';

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', icon: 'Icon' } as const;

/** Approximate text width in em units (CJK ≈ 1em, Latin ≈ 0.56em, spaces ≈ 0.3em). */
export function textEm(text: string, latin = 0.56): number {
  let w = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) w += 0.3;
    else if (/[　-鿿＀-￯]/.test(ch)) w += 1;
    else if (/[A-Z0-9]/.test(ch)) w += latin + 0.08;
    else w += latin;
  }
  return w;
}

/** Font size (mm) so text fits on one line in `availMm`, between min and max. */
export function fitMm(text: string, maxMm: number, availMm: number, minMm: number, latin?: number): number {
  const em = Math.max(textEm(text, latin), 0.01);
  return Math.max(minMm, Math.min(maxMm, availMm / em));
}

function Lock() {
  return (
    <svg className="tc-lock" viewBox="0 0 10 12" aria-hidden="true">
      <rect x="1" y="5" width="8" height="6.5" rx="1.2" fill="currentColor" />
      <path d="M3 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function StatCell({ s, coach }: { s: CardStat; coach: boolean }) {
  return (
    <div className={`tc-stat ${s.locked ? 'is-locked' : ''}`} data-stat={s.key}>
      <div className="tc-stat-top">
        <span className="tc-stat-label">
          {s.key}
          {coach && s.provisional && !s.locked && (
            <span className="prov tc-prov" title={`${STAT_NAMES[s.key]} uses a provisional table or formula`}>
              prov
            </span>
          )}
        </span>
        {!s.locked && s.date && <span className="tc-stat-date">{s.date}</span>}
      </div>
      {s.locked ? (
        <div className="tc-stat-locked" title={`${STAT_NAMES[s.key]} is locked`}>
          <Lock />
          <span className="tc-hint" data-fit>
            {s.hint ?? 'Locked'}
          </span>
        </div>
      ) : (
        <div className="tc-stat-value num">{s.value}</div>
      )}
    </div>
  );
}

export function TradingCard({ data, coach = false, style }: { data: CardData; coach?: boolean; style?: CSSProperties }) {
  const nameSize = fitMm(data.name, 4.4, 38, 2.2, 0.6);
  const raceLine = data.race.line ?? '';
  const raceLineSize = fitMm(raceLine, 2.3, 39, 1.55);
  const tierLabel = TIER_LABEL[data.tier];
  const cls = ['tcard', `tcard--${data.tier}`, data.inForm ? 'tcard--inform' : ''].filter(Boolean).join(' ');
  return (
    <article className={cls} style={style} data-athlete={data.athleteId} aria-label={`Card for ${data.name}`}>
      <div className="tc-inner">
        <div className="tc-sash" aria-hidden="true" />
        <header className="tc-head">
          <div className="tc-ovr">
            <div className="tc-ovr-num num" data-fit>
              {data.ovr}
            </div>
            <div className="tc-ovr-n">{data.unlocked}/6</div>
          </div>
          <div className="tc-id">
            <div className="tc-tier">
              <span className="tc-tier-name">{tierLabel}</span>
              <span className="tc-dot">·</span>
              <span>{data.yearGroup === 'Staff' ? 'Staff' : data.yearGroup}</span>
              {coach && data.provisionalAny && <span className="prov tc-prov">prov</span>}
            </div>
            <div className="tc-name" data-fit style={{ fontSize: `${nameSize}mm` }}>
              {data.name}
            </div>
          </div>
        </header>

        <section className={`tc-race ${data.race.locked ? 'is-locked' : ''}`}>
          <div className="tc-race-top">
            <span className="tc-race-label">RACE</span>
            {data.race.locked ? (
              <span className="tc-race-locked">
                <Lock />
                <span data-fit>{data.race.hint ?? 'Race to unlock'}</span>
              </span>
            ) : (
              <span className="tc-race-value num">{data.race.value}</span>
            )}
            {coach && data.race.provisional && !data.race.locked && <span className="prov tc-prov">prov</span>}
            <span className="tc-caps" title={`${data.race.caps} race caps`}>
              <span className="tc-star">★</span>
              <span className="num">{data.race.caps}</span>
            </span>
          </div>
          {raceLine && (
            <div className="tc-race-line" data-fit style={{ fontSize: `${raceLineSize}mm` }}>
              {raceLine}
            </div>
          )}
        </section>

        <section className="tc-art">
          {data.inForm && (
            <div className="tc-inform">
              <span className="tc-inform-tag">IN-FORM</span>
              {data.inFormText && <span className="tc-inform-text">{data.inFormText}</span>}
            </div>
          )}
          <AvatarSvg avatar={data.avatar} unlocks={data.unlocks} className="tc-avatar" />
        </section>

        <section className="tc-stats">
          {data.stats.map((s) => (
            <StatCell key={s.key} s={s} coach={coach} />
          ))}
        </section>

        <section className="tc-row">
          <span className={`tc-streak ${data.streak > 0 ? '' : 'is-zero'}`} title={`${data.streak}-week streak`}>
            <svg className="tc-flame" viewBox="0 0 12 16" aria-hidden="true">
              <path d="M6 0C7 4 11 6 11 10.5A5 5 0 0 1 1 10.5C1 8 2.6 6.6 3.4 5.2 3.8 7 4.6 7.6 5.2 7.8 5 5 5.4 2.4 6 0Z" fill="currentColor" />
            </svg>
            <span className="num">{data.streak}</span>
            {data.holidayFlames > 0 && <span className="tc-bonus">+{data.holidayFlames}</span>}
          </span>
          <span className="tc-badges">
            {data.badges.map((b) => (
              <span key={b.key} className={`tc-badge ${b.tier ? `tc-badge--${b.tier}` : ''}`} title={b.label}>
                <span className="tc-badge-ico">{b.icon}</span>
                {b.count != null && b.count > 1 && <span className="tc-badge-count">{b.count}</span>}
              </span>
            ))}
          </span>
        </section>

        <footer className="tc-footer" data-fit>
          Tasuki Cards · Harrow Appi Trail Running
        </footer>
      </div>
    </article>
  );
}
