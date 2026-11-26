// Settings → White Season: the season calendar, the cards and tiers, the streak rules, the Winter Ekiden route
// and km per session, the weekly post templates, and the winter roster. Every change is a new config version
// (the winter roster is stored on the athletes).
import { useMemo, useState } from 'react';
import type { Athlete } from '../../../types';
import { YEAR_GROUPS } from '../../../types';
import { cloneConfig, nextConfigVersion, type Config, type RouteStation, type WhiteHalfTerm, type WinterCard } from '../../../engine/config';
import { deriveAll, diffRatings } from '../../../engine/derive';
import { fullName } from '../../../engine/display';
import { isISODate } from '../../../engine/dates';
import { inWinterProgramme, snapMonday, suggestKmPerSession } from '../../../engine/white';
import { Field, Panel } from '../../components/common';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';

type W = Config['winter'];

const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const cells = (l: string) => l.split('|').map((c) => c.trim());

function parseMondays(t: string, label: string, errors: string[]): string[] {
  const out: string[] = [];
  for (const l of t.split(/[\s,]+/).filter(Boolean)) {
    if (!isISODate(l)) errors.push(`${label}: “${l}” is not a date (YYYY-MM-DD)`);
    else if (snapMonday(l) !== l) errors.push(`${label}: ${l} is not a Monday`);
    else out.push(l);
  }
  return [...new Set(out)].sort();
}

function parseHalfTerms(t: string, errors: string[], old: WhiteHalfTerm[]): WhiteHalfTerm[] {
  return lines(t).map((l, i) => {
    const [name, start, end] = cells(l);
    if (!isISODate(start) || !isISODate(end) || start > end) errors.push(`Half-term line ${i + 1}: write “Name | start | end”`);
    return { id: old.find((h) => h.start === start)?.id ?? `ht-${start}`, name: name || `Half-term ${i + 1}`, start, end };
  });
}

function parseCards(t: string, errors: string[]): WinterCard[] {
  const out = lines(t).map((l, i) => {
    const [code, name, flag] = cells(l);
    if (!/^[A-Za-z]$/.test(code ?? '') || !name) errors.push(`Card line ${i + 1}: write “E | Engine” (one letter, then the name; add “| tierless” for a card with no level)`);
    return { code: (code ?? '').toUpperCase(), name: name ?? '', ...(/tierless|no level/i.test(flag ?? '') ? { tierless: true } : {}) };
  });
  if (new Set(out.map((c) => c.code)).size !== out.length) errors.push('Two cards share a letter');
  return out;
}

function parseRoute(t: string, errors: string[]): RouteStation[] {
  const out = lines(t).map((l, i) => {
    const [name, km, flag] = cells(l);
    if (!name || !Number.isFinite(Number(km))) errors.push(`Route line ${i + 1}: write “Station | km”`);
    return { name, km: Number(km), ...(/day ?1|finish/i.test(flag ?? '') ? { dayFinish: true } : {}) };
  });
  for (let i = 1; i < out.length; i++) if (!(out[i].km > out[i - 1].km)) errors.push(`Route: ${out[i].name} must be further than ${out[i - 1].name}`);
  return out;
}

const templatesText = (list: string[]) => list.join('\n\n');
const parseTemplates = (t: string) => t.split(/\n\s*\n/).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);

export function WhiteSeasonTab() {
  const { config, snapshot, fullSnapshot, derived, asOf, commit } = useData();
  const toast = useToast();
  const w = config.winter;
  const [form, setForm] = useState(() => ({
    whiteEnabled: w.whiteEnabled,
    name: w.season.name,
    start: w.season.start,
    end: w.season.end,
    termWeeks: w.season.termWeeks.join('\n'),
    holidayWeeks: w.season.holidayWeeks.join('\n'),
    halfTerms: w.season.halfTerms.map((h) => `${h.name} | ${h.start} | ${h.end}`).join('\n'),
    cards: w.cards.map((c) => `${c.code} | ${c.name}${c.tierless ? ' | tierless' : ''}`).join('\n'),
    tierNames: [...w.tierNames],
    slogan: w.slogan,
    weeklyCap: w.weeklyCap,
    minDaysPerWeek: w.minDaysPerWeek,
    selfRfPerHalfTerm: w.selfRfPerHalfTerm,
    missGraceWeeks: w.missGraceWeeks,
    radarSessionsFlag: w.radarSessionsFlag,
    radarQuietWeeks: w.radarQuietWeeks,
    holidayHeroSessions: w.holidayHeroSessions,
    route: w.route.map((s) => `${s.name} | ${s.km}${s.dayFinish ? ' | day 1 finish' : ''}`).join('\n'),
    postTemplates: templatesText(w.postTemplates),
    postTotalTemplates: templatesText(w.postTotalTemplates),
    postMaxWords: w.postMaxWords,
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const { draft, errors } = useMemo(() => {
    const errors: string[] = [];
    if (!isISODate(form.start) || !isISODate(form.end) || form.start > form.end) errors.push('Season: start and end must be dates, start first');
    const next: W = {
      ...w,
      whiteEnabled: form.whiteEnabled,
      season: {
        name: form.name.trim() || 'White Season',
        start: form.start,
        end: form.end,
        termWeeks: parseMondays(form.termWeeks, 'Counted weeks', errors),
        holidayWeeks: parseMondays(form.holidayWeeks, 'Holiday weeks', errors),
        halfTerms: parseHalfTerms(form.halfTerms, errors, w.season.halfTerms),
      },
      cards: parseCards(form.cards, errors),
      tierNames: form.tierNames.map((t, i) => t.trim() || w.tierNames[i]),
      slogan: form.slogan.trim(),
      weeklyCap: form.weeklyCap,
      minDaysPerWeek: form.minDaysPerWeek,
      selfRfPerHalfTerm: form.selfRfPerHalfTerm,
      missGraceWeeks: form.missGraceWeeks,
      radarSessionsFlag: form.radarSessionsFlag,
      radarQuietWeeks: form.radarQuietWeeks,
      holidayHeroSessions: form.holidayHeroSessions,
      route: parseRoute(form.route, errors),
      postTemplates: parseTemplates(form.postTemplates),
      postTotalTemplates: parseTemplates(form.postTotalTemplates),
      postMaxWords: form.postMaxWords,
    };
    const both = next.season.termWeeks.filter((m) => next.season.holidayWeeks.includes(m));
    if (both.length) errors.push(`A week cannot be both counted and holiday: ${both.join(', ')}`);
    if (!next.postTemplates.length) errors.push('Add at least one weekly post template');
    return { draft: next, errors };
  }, [form, w]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(w);
  const impact = useMemo(() => {
    if (!dirty || errors.length) return null;
    const after = deriveAll(snapshot, asOf, { ...config, winter: draft, version: config.version + 1 });
    return diffRatings(derived, after);
  }, [dirty, errors.length, snapshot, asOf, config, draft, derived]);

  const save = async (patch: Partial<W>, note: string, base: W = draft) => {
    const nextDraft = cloneConfig(config);
    nextDraft.winter = { ...base, ...patch };
    const next = nextConfigVersion(config, nextDraft, new Date().toISOString(), note);
    await commit({ put: { configs: [next] } });
    toast(`Config version ${next.version} applied: ${note}`, 'ok');
  };

  // Winter roster and km per session.
  const roster = useMemo(() => fullSnapshot.athletes.filter((a) => a.active).sort((a, b) => YEAR_GROUPS.indexOf(a.yearGroup) - YEAR_GROUPS.indexOf(b.yearGroup) || fullName(a).localeCompare(fullName(b))), [fullSnapshot.athletes]);
  const winterRoster = roster.filter(inWinterProgramme);
  const suggested = suggestKmPerSession(winterRoster.length, config);
  const [kps, setKps] = useState(String(w.kmPerSession ?? suggested ?? ''));
  const confirmKps = async () => {
    const v = Math.round(Number(kps) * 100) / 100;
    if (!(v > 0)) return toast('Km per session must be a positive number.', 'err');
    if (w.kmPerSession != null && w.kmPerSession !== v) {
      const cards = derived.ekiden?.totalCards ?? 0;
      const ok = window.confirm(`Change km per session from ${w.kmPerSession} to ${v}? The tasuki would jump from ${(cards * w.kmPerSession).toFixed(1)} km to ${(cards * v).toFixed(1)} km on the board.`);
      if (!ok) return;
    }
    await save({ kmPerSession: v }, `Winter Ekiden: ${v} km per session`, w);
  };
  const setProgramme = async (list: Athlete[], on: boolean) => {
    const changed = list.filter((a) => inWinterProgramme(a) !== on || a.winterProgramme === undefined).map((a) => ({ ...a, winterProgramme: on }));
    if (!changed.length) return;
    await commit({ put: { athletes: changed } });
    toast(`${changed.length} runner${changed.length === 1 ? '' : 's'} ${on ? 'added to' : 'taken off'} the winter roster.`, 'ok');
  };

  const num = (k: 'weeklyCap' | 'minDaysPerWeek' | 'selfRfPerHalfTerm' | 'missGraceWeeks' | 'radarSessionsFlag' | 'radarQuietWeeks' | 'holidayHeroSessions' | 'postMaxWords', label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={0} value={form[k]} onChange={(e) => Number.isFinite(Number(e.target.value)) && e.target.value !== '' && set(k, Math.max(0, Math.round(Number(e.target.value))))} />
    </Field>
  );

  return (
    <div className="stack">
      <Panel title="Winter Ekiden: km per session (confirm once at launch)">
        <p className="small muted">
          Total km = credited sessions (term and holiday, everyone on the winter roster) × km per session. Suggested: {suggested ?? '—'} km = {Math.max(0, ...w.route.map((s) => s.km))} km ÷ ({winterRoster.length} runners × {w.season.termWeeks.length} counted weeks), rounded to 0.05 km, which reaches the finish in late March if runners average one session a week.
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={`Km per session${w.kmPerSession == null ? ' (not set yet: the board shows 0 km)' : ` (now ${w.kmPerSession})`}`}>
            <input className="input" type="number" step="0.05" min="0" value={kps} onChange={(e) => setKps(e.target.value)} />
          </Field>
          <button className="btn btn-primary" onClick={confirmKps} data-testid="confirm-kps">
            {w.kmPerSession == null ? 'Confirm' : 'Change'}
          </button>
          {suggested != null && (
            <button className="btn" onClick={() => setKps(String(suggested))}>
              Use suggestion
            </button>
          )}
        </div>
      </Panel>

      <Panel title={`Winter roster (${winterRoster.length} of ${roster.length} active runners)`} actions={
        <span className="row">
          <button className="btn btn-sm" onClick={() => setProgramme(roster.filter((a) => a.yearGroup !== 'Staff'), true)}>All Y7–Y13 on</button>
          <button className="btn btn-sm" onClick={() => setProgramme(roster.filter((a) => a.yearGroup === 'Staff'), false)}>Staff off</button>
        </span>
      }>
        <p className="small muted">Runners on the winter roster are on the Gym Log sheet, keep their streak with gym sessions and move the team tasuki. Default: active Y7–Y13 on, Staff off.</p>
        <div className="white-roster">
          {YEAR_GROUPS.map((yg) => {
            const list = roster.filter((a) => a.yearGroup === yg);
            if (!list.length) return null;
            return (
              <div key={yg} className="white-roster-group">
                <div className="row-between">
                  <strong>{yg}</strong>
                  <span>
                    <button className="btn btn-sm" onClick={() => setProgramme(list, true)}>All on</button> <button className="btn btn-sm" onClick={() => setProgramme(list, false)}>All off</button>
                  </span>
                </div>
                {list.map((a) => (
                  <label key={a.id} className="check small">
                    <input type="checkbox" checked={inWinterProgramme(a)} onChange={(e) => setProgramme([a], e.target.checked)} /> {fullName(a)}
                    {a.summitPass && <span title={`Summit pass from ${a.summitPass.date}`}> ▲</span>}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Season and rules" actions={
        <button className="btn btn-accent" disabled={!dirty || errors.length > 0} onClick={() => save({}, 'White Season settings')} data-testid="save-white">
          Apply as a new config version
        </button>
      }>
        {errors.map((e) => (
          <p key={e} className="small" style={{ color: 'var(--err, #b00020)', margin: '0 0 4px' }}>{e}</p>
        ))}
        {impact && <p className="small">{impact.length ? `${impact.length} displayed ratings would change (the freshness pause and Growth Shield follow the season weeks).` : 'No rating changes.'}</p>}
        <label className="check">
          <input type="checkbox" checked={form.whiteEnabled} onChange={(e) => set('whiteEnabled', e.target.checked)} /> White Season on (outside the season, every existing rule applies as before)
        </label>
        <div className="grid-3">
          <Field label="Season name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Starts (a Monday)"><input className="input" type="date" value={form.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="Ends (a Sunday)"><input className="input" type="date" value={form.end} onChange={(e) => set('end', e.target.value)} /></Field>
          <Field label="Counted term weeks (Mondays, one per line)"><textarea className="textarea" rows={8} value={form.termWeeks} onChange={(e) => set('termWeeks', e.target.value)} /></Field>
          <Field label="Holiday weeks: neutral (Mondays)"><textarea className="textarea" rows={8} value={form.holidayWeeks} onChange={(e) => set('holidayWeeks', e.target.value)} /></Field>
          <Field label="Half-terms for the self-RF allowance (Name | start | end)"><textarea className="textarea" rows={8} value={form.halfTerms} onChange={(e) => set('halfTerms', e.target.value)} /></Field>
        </div>
        <div className="grid-3">
          {num('weeklyCap', 'Weekly cap (credited sessions)')}
          {num('minDaysPerWeek', 'Different days for a qualifying week')}
          {num('selfRfPerHalfTerm', 'Self RFs per half-term')}
          {num('missGraceWeeks', 'Miss grace weeks (frosted before broken)', 'White Season only. 1 = "never miss twice".')}
          {num('radarSessionsFlag', 'Radar: sessions in one week to flag')}
          {num('radarQuietWeeks', 'Radar: counted weeks with no session')}
          {num('holidayHeroSessions', 'Holiday Hero: sessions in one holiday')}
        </div>
        <div className="grid-3">
          <Field label="Cards (letter | name, add | tierless)"><textarea className="textarea" rows={7} value={form.cards} onChange={(e) => set('cards', e.target.value)} /></Field>
          <div>
            {form.tierNames.map((t, i) => (
              <Field key={i} label={`Tier ${i + 1} name${i === 2 ? ' (needs a Summit pass)' : ''}`}>
                <input className="input" value={t} onChange={(e) => set('tierNames', form.tierNames.map((x, j) => (j === i ? e.target.value : x)))} />
              </Field>
            ))}
            <Field label="Slogan"><input className="input" value={form.slogan} onChange={(e) => set('slogan', e.target.value)} /></Field>
          </div>
          <Field label="Route (Station | cumulative km; mark the Day 1 finish with | day 1 finish)"><textarea className="textarea" rows={11} value={form.route} onChange={(e) => set('route', e.target.value)} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Weekly post templates (one per paragraph, used in rotation)" hint="Placeholders: {cardsWeek} {kmWeek} {kmTotal} {leg} {nextStation} {kmToNext} {thawCount} {thawNames}">
            <textarea className="textarea" rows={10} value={form.postTemplates} onChange={(e) => set('postTemplates', e.target.value)} />
          </Field>
          <Field label="Total-km templates (used when this week's cards are fewer than last week's)">
            <textarea className="textarea" rows={10} value={form.postTotalTemplates} onChange={(e) => set('postTotalTemplates', e.target.value)} />
          </Field>
        </div>
        {num('postMaxWords', 'Weekly post: at most this many words')}
      </Panel>
    </div>
  );
}
