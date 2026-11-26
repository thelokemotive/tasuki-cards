// White Season on the athlete page (coach view only): Winter Shield, paused days, the weeks, "!" entries,
// recovery weeks and winter badges. Also the frost frame for the card. Nothing here appears on boards,
// projector views, batch prints or the pupils' copy.
import type { ReactNode } from 'react';
import type { AthleteDerived } from '../../engine/derive';
import type { Config } from '../../engine/config';
import { formatShortDate, weekMonday } from '../../engine/dates';
import { entryCode, type WhiteWeek } from '../../engine/white';

const STATUS_LABEL: Record<WhiteWeek['status'], string> = { qualifying: 'qualifying', neutral: 'neutral', frosted: 'frosted (held)', broken: 'broken', current: 'this week' };

/** The ice-crystal border (an original, subtle frame) and its line. Athlete page and its single-card print only. */
export function FrostFrame({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  const crystal = (
    <svg viewBox="-10 -10 20 20" className="frost-crystal" aria-hidden="true">
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1="0" y1="-9" x2="0" y2="9" />
          <line x1="0" y1="-6" x2="-2.5" y2="-8" />
          <line x1="0" y1="-6" x2="2.5" y2="-8" />
          <line x1="0" y1="6" x2="-2.5" y2="8" />
          <line x1="0" y1="6" x2="2.5" y2="8" />
        </g>
      ))}
    </svg>
  );
  return (
    <div className="frost-frame" data-testid="frost">
      <span className="frost-c frost-tl">{crystal}</span>
      <span className="frost-c frost-tr">{crystal}</span>
      <span className="frost-c frost-bl">{crystal}</span>
      <span className="frost-c frost-br">{crystal}</span>
      {children}
      <div className="frost-line">FROSTED · one good week thaws it</div>
    </div>
  );
}

export function WhitePanel({ d, config }: { d: AthleteDerived; config: Config }) {
  const s = d.white;
  if (!s) return null;
  const cardName = (code: string) => config.winter.cards.find((c) => c.code === code)?.name ?? code;
  const hurt = s.weeks.flatMap((w) => w.entries.filter((e) => e.hurt));
  const rfs = s.weeks.filter((w) => w.rf);
  const freezes = s.weeks.filter((w) => w.neutralBy && w.neutralBy !== 'holiday');
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <span className={`pill ${s.shield === 'on' ? 'pill-ok' : s.shield === 'frosted' ? 'pill-ai' : ''}`} data-testid="winter-shield">
          Winter Shield: {s.shield}
        </span>
        <span className="small">
          {s.pausedDays} day{s.pausedDays === 1 ? '' : 's'} paused this season (results do not age)
        </span>
        <span className="small muted">
          {s.creditedTotal} credited session{s.creditedTotal === 1 ? '' : 's'} · cards logged: {s.cardsLogged.join(' ') || '—'}
        </span>
        {d.athlete.summitPass && <span className="pill">▲ Summit pass since {formatShortDate(d.athlete.summitPass.date)}</span>}
      </div>
      <div className="white-weeks">
        {s.weeks.map((w) => (
          <div key={w.week} className={`white-wk white-${w.status}${w.kind === 'holiday' ? ' white-hol' : ''}`} title={`${formatShortDate(w.monday)}: ${STATUS_LABEL[w.status]}${w.neutralBy ? ` (${w.neutralBy})` : ''}${w.thaw ? ', Comeback Thaw' : ''}${w.rf ? `, RF ${w.rf.replace('_', ' ')}` : ''}`}>
            <span className="white-date">{formatShortDate(w.monday)}</span>
            <span className="white-codes">{w.entries.map((e) => (e.credited ? entryCode(e) : `(${entryCode(e)})`)).join(' ') || (w.neutralBy && w.neutralBy !== 'holiday' ? w.neutralBy.replace('_', ' ') : '·')}</span>
            {w.thaw && <span aria-label="Comeback Thaw">🌱</span>}
          </div>
        ))}
      </div>
      <div className="row tiny muted">
        <span className="white-wk white-qualifying white-key" /> qualifying <span className="white-wk white-neutral white-key" /> neutral (holiday or freeze) <span className="white-wk white-frosted white-key" /> frosted: streak held <span className="white-wk white-broken white-key" /> broken · (A2) = stored, not credited
      </div>
      {hurt.length > 0 && (
        <p className="small paste-amber" style={{ maxWidth: 'none', padding: '4px 8px', borderRadius: 6 }}>
          “!” something hurt: {hurt.map((e) => `${formatShortDate(e.date)} ${cardName(e.card)}`).join(' · ')}
        </p>
      )}
      {(rfs.length > 0 || freezes.length > 0) && (
        <p className="small">
          Freezes: {freezes.map((w) => `${formatShortDate(weekMonday(w.week))} ${w.neutralBy!.replace('_', ' ')}`).join(', ') || 'none'}
          {rfs.some((w) => w.rf !== 'used') && ` · RF not used: ${rfs.filter((w) => w.rf !== 'used').map((w) => `${formatShortDate(w.monday)} (${w.rf === 'over_allowance' ? 'over the allowance' : 'week already qualified'})`).join(', ')}`}
        </p>
      )}
      {d.winterBadges.length > 0 && (
        <div className="badge-list">
          {d.winterBadges.map((b) => (
            <span key={b.key} className="badge-chip">
              <span aria-hidden="true">{b.icon}</span> {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
