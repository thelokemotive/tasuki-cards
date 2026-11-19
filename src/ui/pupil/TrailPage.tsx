// The pupil's home on their phone: 獣道 Kemonomichi, the Trail. Their companion spirit, this week at a
// glance (the streak as a trail of stepping stones), what's new since they last looked (revealed one moment
// at a time), this week's missions, their card and next camp, their six spirits, the squad's shared quest,
// their badge collection and a piece of trail lore. Everything comes from the public copy the coach
// publishes; nothing here changes a rating.
import './pupil.css';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext';
import { useAccount, type TreadmillLog } from '../cloud/account';
import { Link } from '../router';
import { Modal } from '../components/common';
import { TradingCard } from '../cards/TradingCard';
import { buildCardData } from '../cards/cardData';
import { YamaScene, type SceneMood } from '../art/YamaScene';
import { SpiritPortrait } from '../art/Spirits';
import { displayName } from '../../engine/display';
import { isoWeek } from '../../engine/dates';
import { summitLadder, CAMPS } from '../../engine/coach';
import { momentsSince, seenState } from '../../engine/moments';
import { seasonOf, squadQuest, trailFinds, trailWeek, weeklyMissions, type TrailWeek } from '../../engine/trail';
import { defaultCompanion, LORE, pickForDay, SPIRITS, STAT_LONG, STAT_SPIRIT, type SpiritId } from '../../engine/spirits';
import { STAT_KEYS, type RatingKey } from '../../engine/types';
import type { AthleteDerived } from '../../engine/derive';
import { readSeen, useCompanion, useMyCard, writeSeen } from './local';
import { Celebrate } from './Celebrate';
import { Flame, TrailStrip } from './TrailStrip';
import { chime, setSound, soundOn } from './juice';
import { PickCard } from './PickCard';
import { InstallCard } from './InstallCard';
import { RemindersCard } from './RemindersCard';
import { updateAppBadge } from './pwa';

function greeting(hour: number): string {
  return hour < 11 ? 'Ohayō' : hour < 17 ? 'Konnichiwa' : 'Konbanwa';
}

function sceneMood(date: string, hour: number): SceneMood {
  if (hour >= 19 || hour < 5) return 'night';
  if (hour < 7) return 'dawn';
  return seasonOf(date);
}

function companionLine(tw: TrailWeek, spirit: SpiritId, day: string): string {
  const name = SPIRITS[spirit].name.replace(/^(Japanese|Blakiston's|Steller's|Peregrine) /, '').toLowerCase();
  const n = tw.next;
  switch (tw.status) {
    case 'kept':
      return pickForDay([`This week is kept. The ${name} approves.`, `${tw.streak > 1 ? `${tw.streak} weeks in a row.` : 'A new trail has begun.'} Rest well: that is training too.`, 'Week done. Anything else this week is just for fun.'], day);
    case 'pending':
      return 'Your run is with your coach. I will keep the fire warm until they approve it.';
    case 'holiday':
      return 'Holiday week. Even the dugong rests. Your trail is safe.';
    case 'frozen':
      return 'Your coach is holding this week for you. Rest up; the trail waits.';
    default:
      if (tw.comeback) return 'The Amami rabbit nearly vanished, and came back. So can you: one run starts a new trail.';
      if (tw.streak === 0) return `One run this week starts your first trail week. ${tw.daysLeft} ${tw.daysLeft === 1 ? 'day' : 'days'} to go.`;
      return pickForDay([`${tw.daysLeft} ${tw.daysLeft === 1 ? 'day' : 'days'} left. One run makes your trail ${n} weeks.`, `The ${name} is waiting at the trailhead. One run by Sunday makes it ${n}.`, `The trail is ${tw.streak} ${tw.streak === 1 ? 'week' : 'weeks'} long. One run keeps it growing.`], day);
  }
}

function statusLine(tw: TrailWeek): string {
  switch (tw.status) {
    case 'kept':
      return 'This week: kept ✓';
    case 'pending':
      return 'This week: kindling (waiting for your coach)';
    case 'holiday':
      return 'This week: holiday, your trail is safe';
    case 'frozen':
      return 'This week: frozen, your trail is safe';
    default:
      return `This week: ${tw.daysLeft} ${tw.daysLeft === 1 ? 'day' : 'days'} left · one session keeps it`;
  }
}

export function TrailPage() {
  const [me, setMe] = useMyCard();
  const { derived } = useData();
  const d = me ? derived.athletes.get(me) : undefined;
  if (!d || d.athlete.hiddenOnline) return <PickCard onPick={(id) => setMe(id)} />;
  return <Trail d={d} onSwitch={() => setMe(null)} />;
}

function Trail({ d, onSwitch }: { d: AthleteDerived; onSwitch: () => void }) {
  const { derived, config, today, snapshot } = useData();
  const asOf = today;
  const holidays = useMemo(() => new Set(snapshot.calendar.holidayWeeks), [snapshot.calendar.holidayWeeks]);
  const account = useAccount();
  const id = d.athlete.id;
  const [mine, setMine] = useState<TreadmillLog[]>([]);
  useEffect(() => {
    account?.treadmill?.mine().then(setMine, () => setMine([]));
  }, [account]);
  const week = isoWeek(asOf);
  const pending = mine.filter((l) => l.athleteId === id && isoWeek(l.date) === week).length;
  const tw = useMemo(() => trailWeek(d, config, asOf, pending, holidays), [d, config, asOf, pending, holidays]);
  const missions = useMemo(() => weeklyMissions(d, config, tw), [d, config, tw]);
  const quest = useMemo(() => squadQuest(derived, asOf), [derived, asOf]);
  const finds = useMemo(() => trailFinds(d, config), [d, config]);
  const ladder = summitLadder(d, config);
  const [chosen, setCompanion] = useCompanion(id);
  const companion = chosen ?? defaultCompanion(d.ratings.stats);
  const [sheet, setSheet] = useState<SpiritId | null>(null);
  const [reveal, setReveal] = useState(false);
  const [sound, setSoundState] = useState(soundOn);
  const [seenTick, setSeenTick] = useState(0);
  const moments = useMemo(() => momentsSince(readSeen(id), d), [id, d, seenTick]);
  const season = seasonOf(asOf);
  const hour = new Date().getHours();
  const first = displayName(d.athlete).split(' ')[0];

  // First visit on this phone: remember where things stand, so only later news is revealed.
  useEffect(() => {
    if (!readSeen(id)) writeSeen(id, seenState(d));
  }, [id, d]);
  useEffect(() => {
    const dow = new Date().getDay();
    updateAppBadge(tw.status === 'open' && (dow === 0 || dow >= 4));
  }, [tw.status]);

  const flame = tw.status === 'kept' ? 'lit' : tw.status === 'pending' ? 'ember' : tw.streak > 0 || tw.status === 'holiday' || tw.status === 'frozen' ? 'waiting' : 'out';
  const lore = pickForDay(LORE, asOf, 7);

  return (
    <div className="trail">
      <section className={`trail-hero trail-hero-${tw.status}`}>
        <YamaScene mood={sceneMood(asOf, hour)} shape="banner" seed={7 + (id.length % 5)} className="trail-scene" />
        <div className="trail-hero-top">
          <button className="trail-companion" onClick={() => setSheet(companion)} aria-label={`Your companion: ${SPIRITS[companion].name}`}>
            <SpiritPortrait id={companion} />
          </button>
          <div className="trail-bubble">
            <div className="trail-hello">
              {greeting(hour)}, {first}!
            </div>
            <div>{companionLine(tw, companion, asOf)}</div>
          </div>
        </div>
        <div className="trail-streak">
          <Flame level={flame} size={46} />
          <div>
            <div className="trail-streak-n num">{tw.streak}</div>
            <div className="trail-streak-l">week trail</div>
          </div>
          <div className="trail-streak-best">
            best {tw.best}
            {tw.milestone && (
              <>
                <br />
                {tw.milestone.held ? `${tw.milestone.toGo} to ${tw.milestone.at} in a row` : `${tw.milestone.toGo} to the ${tw.milestone.at}-week badge`}
              </>
            )}
          </div>
        </div>
        <TrailStrip tw={tw} />
        <div className="trail-status">{statusLine(tw)}</div>
      </section>

      {moments.length > 0 && (
        <button
          className="trail-reveal"
          onClick={() => {
            chime('tap');
            setReveal(true);
          }}
        >
          <span className="trail-reveal-spark" aria-hidden="true">
            ✦
          </span>
          <span>
            <strong>{moments.length === 1 ? 'Something new' : `${moments.length} new things`} since you last looked</strong>
            <span className="tiny">Tap to reveal</span>
          </span>
        </button>
      )}

      <section className="trail-panel">
        <h2 className="trail-h">This week's missions</h2>
        <ul className="missions">
          {missions.map((m) => (
            <li key={m.id} className={`mission ${m.done ? 'done' : ''}`}>
              <SpiritPortrait id={m.spirit} className="mission-spirit" />
              <div className="mission-body">
                <div className="mission-title">
                  {m.title}
                  {m.done && <span className="mission-tick" aria-label="done">✓</span>}
                </div>
                <div className="mission-detail">{m.detail}</div>
                {m.progress != null && (
                  <div className="bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(4, m.progress * 100)}%` }} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {tw.status === 'open' && (
          <Link to="/log" className="btn-press btn-press-shu trail-log">
            📷 Log a treadmill run
          </Link>
        )}
      </section>

      <section className="trail-panel trail-card">
        <Link to={`/athlete/${id}/share`} className="trail-card-pic" aria-label="Open your card">
          <TradingCard data={buildCardData(d)} />
        </Link>
        <div className="trail-card-side">
          <h2 className="trail-h">Your climb</h2>
          <div className="tiny muted">
            {CAMPS[ladder.tier].jp} {CAMPS[ladder.tier].name}
            {ladder.next ? ` → ${CAMPS[ladder.next].name}` : ''}
          </div>
          <div className="bar bar-gold" aria-label={`${Math.round(ladder.progress * 100)}% of the way to the next camp`}>
            <span style={{ width: `${Math.max(4, ladder.progress * 100)}%` }} />
          </div>
          <p className="small" style={{ margin: '6px 0 10px' }}>
            {ladder.headline}
          </p>
          <Link to={`/athlete/${id}/share`} className="btn btn-sm">
            How my ratings work
          </Link>
        </div>
      </section>

      <section className="trail-panel">
        <h2 className="trail-h">Your spirits</h2>
        <p className="tiny muted" style={{ marginTop: -4 }}>
          One for each stat. A stat you have not tried yet is a spirit still asleep. Tap one to meet it.
        </p>
        <div className="spirit-row">
          {[...STAT_KEYS, 'RACE' as const].map((k: RatingKey) => {
            const asleep = k === 'RACE' ? d.ratings.race.locked : d.ratings.stats[k].locked;
            const v = k === 'RACE' ? d.ratings.race.value : d.ratings.stats[k].value;
            const sp = STAT_SPIRIT[k];
            return (
              <button key={k} className={`spirit-chip ${asleep ? 'asleep' : ''} ${sp === companion ? 'chosen' : ''}`} onClick={() => setSheet(sp)}>
                <SpiritPortrait id={sp} dim={asleep} />
                <span className="spirit-chip-k">{k}</span>
                <span className="spirit-chip-v num">{asleep || v == null ? 'zzz' : v}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="trail-panel">
        <h2 className="trail-h">Squad quest</h2>
        <div className="quest">
          <SpiritPortrait id="monkey" className="quest-spirit" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="small">
              <strong className="num" style={{ fontSize: '1.25rem' }}>
                {quest.kept}
              </strong>{' '}
              {quest.kept === 1 ? 'runner has' : 'runners have'} kept this week · goal {quest.target}
              {quest.reached ? ' · quest complete! 🎉' : ''}
            </div>
            <div className="bar bar-moss" aria-hidden="true">
              <span style={{ width: `${quest.target ? Math.min(100, (quest.kept / quest.target) * 100) : 0}%` }} />
            </div>
            <div className="tiny muted">
              Like a troop of snow monkeys, every runner's week counts. The goal is one more than the squad's best week this month. Last week: {quest.lastWeek} of {quest.runners}.
            </div>
          </div>
        </div>
        <Link to="/squad" className="btn btn-sm" style={{ marginTop: 10 }}>
          Squad and boards
        </Link>
      </section>

      <InstallCard />
      <RemindersCard athleteId={id} />

      <section className="trail-panel">
        <h2 className="trail-h">Trail finds</h2>
        <div className="finds">
          {finds.map((f) => (
            <div key={f.key} className={`find ${f.found ? 'found' : ''}`} title={f.found ? f.label : `${f.label}: ${f.how}`}>
              <span className="find-icon" aria-hidden="true">
                {f.found ? f.icon : '?'}
              </span>
              <span className="find-label">{f.label}</span>
              {!f.found && <span className="find-how">{f.how}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="trail-panel trail-lore">
        <div className="tiny muted">Trail lore</div>
        <h3>{lore.title}</h3>
        <p className="small" style={{ margin: 0 }}>
          {lore.text}
        </p>
      </section>

      <div className="trail-foot">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setSound(!sound);
            setSoundState(!sound);
            if (!sound) chime('tap');
          }}
        >
          {sound ? '🔊 Sound on' : '🔇 Sound off'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onSwitch}>
          Not {first}? Change card
        </button>
      </div>

      {sheet && (
        <Modal title={SPIRITS[sheet].name} onClose={() => setSheet(null)}>
          <div className="spirit-sheet">
            <SpiritPortrait id={sheet} className="spirit-sheet-pic" />
            <div className="tiny muted">
              {SPIRITS[sheet].jp} · {SPIRITS[sheet].stat ? `${STAT_LONG[SPIRITS[sheet].stat!]} (${SPIRITS[sheet].stat})` : SPIRITS[sheet].gift} · {SPIRITS[sheet].home}
            </div>
            <p>{SPIRITS[sheet].why}</p>
            <ul className="small">
              {SPIRITS[sheet].facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {sheet !== companion ? (
              <button
                className="btn-press btn-press-ai"
                onClick={() => {
                  setCompanion(sheet);
                  chime('step');
                  setSheet(null);
                }}
              >
                Walk the trail with the {SPIRITS[sheet].name.toLowerCase()}
              </button>
            ) : (
              <p className="small muted">Your companion on the trail.</p>
            )}
          </div>
        </Modal>
      )}

      {reveal && (
        <Celebrate
          moments={moments}
          season={season}
          onDone={() => {
            writeSeen(id, seenState(d));
            setReveal(false);
            setSeenTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
