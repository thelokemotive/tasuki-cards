// Settings → Scoring constants (spec 8): every constant editable, an impact preview before applying
// ("14 ratings change; largest +4 for …"), and versioned history (restore any earlier version).
import { useMemo, useState, type ReactNode } from 'react';
import { Field, Modal, Panel } from '../../components/common';
import { useToast } from '../../components/Toast';
import { useData } from '../../data/DataContext';
import { cloneConfig, nextConfigVersion, withDefaults, type Config } from '../../../engine/config';
import { deriveAll, diffRatings } from '../../../engine/derive';
import { fullName } from '../../../engine/display';
import { AGE_GRADE_SOURCE } from '../../../engine/standards';
import { BLEEP_PERCENTILES } from '../../../engine/config';

type Path = (string | number)[];

const SECTION_LABELS: Record<string, string> = {
  ageGrade: 'Age-grade standards (3.4)',
  age: 'Age on a date (3.2)',
  runScore: 'Run Score (3.5)',
  freshness: 'Freshness (3.7)',
  growthShield: 'Growth Shield (3.8)',
  race: 'RACE weights (3.9)',
  spd: 'SPD: short races',
  clb: 'CLB: hill races',
  end: 'END: bleep test and long runs (3.9)',
  nav: 'NAV (3.9)',
  arm: 'ARM thresholds (3.9)',
  ovr: 'OVR (3.9)',
  tiers: 'Tiers (3.10)',
  inForm: 'In-Form (3.10)',
  streak: 'Streaks (3.11)',
  surge: 'Tasuki Surge (3.12)',
  handicap: 'Handicap start (3.14)',
  badges: 'Badges (3.13)',
  avatarUnlocks: 'Avatar unlocks (5)',
  input: 'Input checks (4)',
  boards: 'Boards (6)',
  backup: 'Backups (9)',
};

const HELP: Record<string, string> = {
  'runScore.anchorAG': 'Age grade that scores 99 (0.80 = 80%, “national class”).',
  'freshness.decayGraceMonths': 'Months a result counts in full.',
  'freshness.decayPointsPerMonth': 'Points lost per month after the grace period.',
  'freshness.expireMonths': 'Results older than this leave current ratings (kept in the Career Vault).',
  'growthShield.margin': 'A stat never shows more than this below its 12-month best while the streak is active.',
  'surge.sanityMinLegs': 'The course sanity gate needs at least this many legs with a baseline on the same event and distance.',
  'ageGrade.table': 'alan_jones_2025 = the cloned 2025 road tables; fallback_provisional = the spec’s fallback (marks ratings provisional).',
  'input.fuzzyThreshold': 'Jaro–Winkler similarity for name suggestions.',
  'end.longRunMinKmEff': 'Minimum effective distance for a race or long run to set END.',
  'spd.raceMaxKmEff': 'A verified race, relay leg or parkrun of up to this effective distance (km) also feeds SPD.',
  'clb.raceMinClimbM': 'A verified race or long run needs at least this much climb (m) to feed CLB…',
  'clb.raceMinClimbPerKm': '…and at least this many metres of climb per km.',
};

const human = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/\bAg\b/, 'AG').replace(/ M$/, ' (men)').replace(/ F$/, ' (women)');

function setAt<T>(o: T, p: Path, v: unknown): T {
  const copy = cloneConfig(o as unknown as Config) as unknown as T;
  let x = copy as unknown as Record<string | number, unknown>;
  for (const k of p.slice(0, -1)) x = x[k] as Record<string | number, unknown>;
  x[p[p.length - 1]] = v;
  return copy;
}

function NumberList({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  const parsed = text.split(/[,\s]+/).filter(Boolean).map(Number);
  const bad = parsed.some((n) => !Number.isFinite(n)) || parsed.length !== value.length;
  return (
    <input
      className={`input ${bad ? 'invalid' : ''}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const p = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number);
        if (p.length === value.length && p.every(Number.isFinite)) onChange(p);
      }}
      title={bad ? `Needs ${value.length} numbers` : undefined}
    />
  );
}

function KeyedMap({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const [text, setText] = useState(Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', '));
  const parse = (t: string) => {
    const out: Record<string, number> = {};
    for (const part of t.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = /^(\d+)\s*:\s*(-?\d*\.?\d+)$/.exec(part);
      if (!m) return null;
      out[m[1]] = Number(m[2]);
    }
    return Object.keys(out).length ? out : null;
  };
  const ok = parse(text) != null;
  return (
    <input
      className={`input ${ok ? '' : 'invalid'}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const p = parse(e.target.value);
        if (p) onChange(p);
      }}
    />
  );
}

/** Generic editor for one config value. */
function ValueEditor({ path, value, onChange }: { path: Path; value: unknown; onChange: (v: unknown) => void }) {
  const key = path.join('.');
  if (key === 'ageGrade.table') {
    return (
      <select className="select" value={value as string} onChange={(e) => onChange(e.target.value)}>
        <option value="alan_jones_2025">Alan Jones 2025 road tables ({AGE_GRADE_SOURCE.commit.slice(0, 7)})</option>
        <option value="fallback_provisional">Fallback table (provisional)</option>
      </select>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {value ? 'on' : 'off'}
      </label>
    );
  }
  if (typeof value === 'number') {
    return <input className="input" type="number" step="any" value={value} onChange={(e) => e.target.value !== '' && Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))} />;
  }
  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) return <NumberList value={value as number[]} onChange={onChange} />;
  if (typeof value === 'string') return <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  return null;
}

function Section({ draft, setDraft, section }: { draft: Config; setDraft: (c: Config) => void; section: keyof Config }) {
  const obj = draft[section] as unknown as Record<string, unknown>;
  const fields: ReactNode[] = [];
  const walk = (o: Record<string, unknown>, path: Path) => {
    for (const [k, v] of Object.entries(o)) {
      const p = [...path, k];
      const key = p.join('.');
      if (key === 'end.bleepTable') {
        fields.push(
          <div key={key} style={{ gridColumn: '1 / -1' }}>
            <div className="small" style={{ fontWeight: 600 }}>Bleep table (laps at P{BLEEP_PERCENTILES.join(', P')}) · provisional until checked against Tomkinson et al. 2017</div>
            <div className="grid-2" style={{ marginTop: 6 }}>
              {(['M', 'F'] as const).map((sex) =>
                Object.keys((v as Record<string, Record<string, number[]>>)[sex]).map((age) => (
                  <Field key={`${sex}${age}`} label={`${sex === 'M' ? 'Boys' : 'Girls'} ${age}${Number(age) === draft.end.bleepMaxAge ? '+' : ''}`}>
                    <NumberList value={(v as Record<string, Record<string, number[]>>)[sex][age]} onChange={(nv) => setDraft(setAt(draft, ['end', 'bleepTable', sex, age], nv))} />
                  </Field>
                )),
              )}
            </div>
          </div>,
        );
        continue;
      }
      if (key === 'ageGrade.fallback.ageFactors') {
        for (const sex of ['M', 'F'] as const) {
          fields.push(
            <Field key={`${key}.${sex}`} label={`Fallback age factors (${sex === 'M' ? 'men' : 'women'}), age: factor`}>
              <KeyedMap value={(v as Record<string, Record<string, number>>)[sex]} onChange={(nv) => setDraft(setAt(draft, ['ageGrade', 'fallback', 'ageFactors', sex], nv))} />
            </Field>,
          );
        }
        continue;
      }
      if (key === 'badges.distances') {
        const list = v as { key: string; label: string; km: number }[];
        list.forEach((d, i) =>
          fields.push(
            <Field key={`${key}.${i}`} label={`${d.label} (km)`}>
              <input className="input" type="number" step="any" value={d.km} onChange={(e) => Number.isFinite(Number(e.target.value)) && setDraft(setAt(draft, ['badges', 'distances', i, 'km'], Number(e.target.value)))} />
            </Field>,
          ),
        );
        continue;
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, p);
        continue;
      }
      fields.push(
        <Field key={key} label={human(p.slice(1).join(' · '))} hint={HELP[key]}>
          <ValueEditor path={p} value={v} onChange={(nv) => setDraft(setAt(draft, p, nv))} />
        </Field>,
      );
    }
  };
  walk(obj, [section]);
  return <div className="grid-3">{fields}</div>;
}

const SECTIONS = Object.keys(SECTION_LABELS) as (keyof Config)[];

export function ScoringTab() {
  const { config, snapshot, derived, asOf, commit } = useData();
  const toast = useToast();
  const [draft, setDraft] = useState<Config>(() => cloneConfig(config));
  const [open, setOpen] = useState<keyof Config>('runScore');
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const dirty = JSON.stringify({ ...draft, version: 0, createdAt: '', note: '' }) !== JSON.stringify({ ...config, version: 0, createdAt: '', note: '' });

  const impact = useMemo(() => {
    if (!dirty) return null;
    const after = deriveAll(snapshot, asOf, { ...draft, version: config.version + 1 });
    const changes = diffRatings(derived, after);
    const athletes = new Set(changes.map((c) => c.athleteId));
    return { changes, athletes: athletes.size };
  }, [dirty, draft, snapshot, asOf, config.version, derived]);

  const apply = async () => {
    const next = nextConfigVersion(config, draft, new Date().toISOString(), note.trim() || undefined);
    await commit({ put: { configs: [next] } });
    setDraft(cloneConfig(next));
    setNote('');
    toast(`Config version ${next.version} applied${impact ? `: ${impact.changes.length} ratings changed` : ''}`, 'ok');
  };

  const name = (id: string) => {
    const a = snapshot.athletes.find((x) => x.id === id);
    return a ? fullName(a) : id;
  };
  const largest = impact?.changes[0];

  return (
    <div className="stack">
      <Panel
        title={`Scoring constants · version ${config.version}`}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => setShowHistory(true)}>
              Version history ({snapshot.configs.length || 1})
            </button>
            <button className="btn btn-sm" disabled={!dirty} onClick={() => setDraft(cloneConfig(config))}>
              Discard changes
            </button>
          </>
        }
      >
        <p className="small muted">Change any value, check the impact preview below, then apply. Every rating records the config version it was computed with; older versions stay in the history and can be restored.</p>
        <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
          {SECTIONS.map((s) => (
            <button key={s} type="button" className={open === s ? 'on' : ''} onClick={() => setOpen(s)}>
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>
        <Section key={open} draft={draft} setDraft={setDraft} section={open} />
      </Panel>

      <Panel title="Impact preview">
        {!dirty ? (
          <p className="muted">No changes yet.</p>
        ) : (
          <>
            <p style={{ fontSize: '1.05rem' }}>
              <strong>
                {impact!.changes.length} rating{impact!.changes.length === 1 ? '' : 's'} change
              </strong>{' '}
              for {impact!.athletes} athlete{impact!.athletes === 1 ? '' : 's'}
              {largest && largest.delta !== 0 && (
                <>
                  ; largest {largest.delta > 0 ? '+' : '−'}
                  {Math.abs(largest.delta)} for {name(largest.athleteId)} ({largest.stat})
                </>
              )}
              .
            </p>
            {impact!.changes.length > 0 && (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Athlete</th>
                      <th>Stat</th>
                      <th className="num">Now</th>
                      <th className="num">After</th>
                      <th className="num">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact!.changes.slice(0, 200).map((c, i) => (
                      <tr key={i}>
                        <td>{name(c.athleteId)}</td>
                        <td>{c.stat}</td>
                        <td className="num">{c.before ?? '🔒'}</td>
                        <td className="num">{c.after ?? '🔒'}</td>
                        <td className="num" style={{ color: c.delta > 0 ? 'var(--ok)' : c.delta < 0 ? 'var(--err)' : undefined }}>
                          {c.before == null ? 'unlocks' : c.after == null ? 'locks' : `${c.delta > 0 ? '+' : ''}${c.delta}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <input className="input" style={{ maxWidth: 380 }} placeholder="Note for the history (e.g. raised anchor to 0.82)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary" onClick={apply}>
                Apply as version {config.version + 1}
              </button>
            </div>
          </>
        )}
      </Panel>

      {showHistory && (
        <Modal title="Config version history" onClose={() => setShowHistory(false)} wide>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Applied</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...(snapshot.configs.length ? snapshot.configs : [config])].sort((a, b) => b.version - a.version).map((c) => (
                  <tr key={c.version}>
                    <td className="num">v{c.version}</td>
                    <td>{new Date(c.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="small">{c.note ?? ''}</td>
                    <td className="right">
                      {c.version !== config.version && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setDraft(withDefaults(cloneConfig(c)));
                            setNote(`Restored the values of v${c.version}`);
                            setShowHistory(false);
                          }}
                        >
                          Load into editor
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}
