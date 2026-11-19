// "What is ARM?": the Armour guide for pupils and coaches. Why each test exists, what it does for you on the trail
// (climbs, descents, rough ground), the injury link, how to build it, how to keep it over winter, how it is scored.
import { useState } from 'react';
import { useData } from '../data/DataContext';
import { PageHeader, Panel } from '../components/common';
import { armHowWorkedOut, armKeep, armWhy, plateGuides } from '../../engine/armGuide';
import { Link } from '../router';

export function ArmourPage() {
  const { derived } = useData();
  const config = derived.config;
  const guides = plateGuides(config);
  const how = armHowWorkedOut(config);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack arm-guide">
      <PageHeader title="Armour (ARM)" subtitle="Why we test it, what it does for you on the trail, and how to build it" actions={<Link className="btn" to="/">Find your card</Link>} />
      <Panel title="What is ARM?">
        <ul>
          {armWhy().map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Panel>

      <div className="arm-plates">
        {guides.map((g) => (
          <Panel
            key={g.domain}
            title={
              <span>
                <span aria-hidden>{g.icon}</span> {g.plate} · {g.test}
              </span>
            }
          >
            <p className="small" style={{ marginTop: 0 }}>
              <strong>The test:</strong> {g.measures}
            </p>
            <h3>On the trail</h3>
            <ul>
              {g.trail.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <h3>Injuries</h3>
            <p className="small">{g.injury}</p>
            <button className="btn btn-sm" aria-expanded={open === g.domain} onClick={() => setOpen(open === g.domain ? null : g.domain)}>
              {open === g.domain ? 'Hide' : 'How to build it'}
            </button>
            {open === g.domain && (
              <>
                <h3>Build it: 10 minutes, 3 times a week</h3>
                <ul>
                  {g.build.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <h3>Winter: gym and ski days</h3>
                <ul>
                  {g.winter.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p className="small">
                  <strong>Careful:</strong> {g.careful}
                </p>
              </>
            )}
          </Panel>
        ))}
      </div>

      <Panel title="Keep it and protect it">
        <ul>
          {armKeep(config).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="How your ARM is worked out">
        <ul>
          {how.lines.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="arm-lookup" aria-label="Sum of the three levels gives ARM">
          {how.lookup.map((x) => (
            <span key={x.sum}>
              {x.sum} → <strong>{x.arm}</strong>
            </span>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Levels: ankle {config.arm.ankleCm.join(' · ')} cm · calf {config.arm.calfReps.join(' · ')} reps
          {config.arm.plate3 === 'control' ? ` · Throne ${config.arm.throneSeatsCm.map((h, i) => `T${i + 1} ${h} cm`).join(' · ')}` : ` · stork ${config.arm.storkSec.join(' · ')} s`}. Full pistol squat on both legs = the “No Throne” badge (it does not change ARM).
        </p>
      </Panel>
    </div>
  );
}
