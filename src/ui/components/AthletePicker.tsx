// Type-ahead athlete picker: matches any alias in any script (romaji, kana, kanji), either name
// order, initials and near-misses, using the same normalisation as Paste & Match.
import { useMemo, useRef, useState } from 'react';
import type { Athlete } from '../../types';
import { jaroWinkler, nameKeys, normaliseName } from '../../engine/names';
import { fullName } from '../../engine/display';

export interface PickerHit {
  athlete: Athlete;
  score: number;
  via?: string;
}

/** Rank roster entries for a typed query (pure; exported for tests). */
export function searchAthletes(query: string, roster: Athlete[], limit = 8): PickerHit[] {
  const q = normaliseName(query);
  if (!q) return [];
  const qCompact = q.replace(/\s+/g, '');
  const hits: PickerHit[] = [];
  for (const a of roster) {
    let best = 0;
    let via: string | undefined;
    const keys = nameKeys(a);
    for (const k of keys) {
      const kc = k.replace(/\s+/g, '');
      let s = 0;
      if (k === q || kc === qCompact) s = 1;
      else if (k.startsWith(q) || kc.startsWith(qCompact)) s = 0.95;
      else if (k.split(' ').some((part) => part.startsWith(q))) s = 0.9;
      else if (k.includes(q) || kc.includes(qCompact)) s = 0.8;
      else {
        // initials: "aiko t" / "a testfield"
        const [x, y] = q.split(' ');
        const parts = k.split(' ');
        if (x && y && parts.length >= 2) {
          const init = (full: string, i: string) => i.length <= 2 && full.startsWith(i.replace(/\.$/, ''));
          if ((parts[0].startsWith(x) && init(parts[1], y)) || (init(parts[0], x) && parts[1].startsWith(y))) s = 0.85;
        }
        if (!s && q.length >= 3) {
          const jw = jaroWinkler(q, k);
          if (jw >= 0.84) s = jw * 0.8;
        }
      }
      if (s > best) {
        best = s;
        via = k;
      }
    }
    if (best > 0) hits.push({ athlete: a, score: best + (a.active ? 0.001 : 0), via });
  }
  return hits.sort((x, y) => y.score - x.score || fullName(x.athlete).localeCompare(fullName(y.athlete))).slice(0, limit);
}

export function AthletePicker({
  roster,
  value,
  onChange,
  placeholder = 'Type a name, alias or kana…',
  autoFocus,
  id,
}: {
  roster: Athlete[];
  value: string | null;
  onChange: (athleteId: string | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const selected = value ? roster.find((a) => a.id === value) : undefined;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchAthletes(query, roster), [query, roster]);

  const choose = (a: Athlete) => {
    onChange(a.id);
    setQuery('');
    setOpen(false);
  };

  if (selected && !open) {
    return (
      <div className="picker-selected row" style={{ gap: 8 }}>
        <span className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'text' }} onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
          <strong>{fullName(selected)}</strong>
          <span className="muted small">{selected.yearGroup}</span>
          {!selected.active && <span className="pill pill-warn">inactive</span>}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(null); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="picker" style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        id={id}
        className="input"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && hits[cursor]) {
            e.preventDefault();
            choose(hits[cursor].athlete);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query && (
        <ul
          className="picker-list"
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: '100%',
            margin: '4px 0 0',
            padding: 4,
            listStyle: 'none',
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {hits.length === 0 && <li className="muted small" style={{ padding: 8 }}>No athlete matches “{query}”.</li>}
          {hits.map((h, i) => (
            <li
              key={h.athlete.id}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h.athlete);
              }}
              onMouseEnter={() => setCursor(i)}
              style={{ padding: '6px 8px', borderRadius: 4, cursor: 'pointer', background: i === cursor ? 'var(--ai-soft)' : undefined, display: 'flex', gap: 8, alignItems: 'baseline' }}
            >
              <strong>{fullName(h.athlete)}</strong>
              <span className="muted small">{h.athlete.yearGroup}</span>
              {!h.athlete.active && <span className="pill pill-warn">inactive</span>}
              {h.via && normaliseName(fullName(h.athlete)) !== h.via && <span className="muted tiny">via “{h.via}”</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
