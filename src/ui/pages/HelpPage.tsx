// In-app Help (spec 4.3: documents the Tasuki line format; plus how the ratings work).
import lineFormat from '../../../docs/LINE-FORMAT.md?raw';
import { Markdown } from '../components/Markdown';
import { PageHeader, Panel } from '../components/common';
import { useData } from '../data/DataContext';
import { AGE_GRADE_SOURCE, isAgeGradeProvisional } from '../../engine/standards';
import { Link } from '../router';

export function HelpPage() {
  const { config } = useData();
  const c = config;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="stack">
      <PageHeader title="Help" subtitle="How Tasuki Cards works, the line format for pasting results, and what every number means." />

      <Panel title="Getting started">
        <ol>
          <li>
            <strong>Import the roster first</strong>: <Link to="/roster">Roster</Link> → Import roster. Paste rows from the school spreadsheet (Surname | Preferred Name | …) or simple lines such as{' '}
            <code>Testfield, Aiko, Y9, F</code>. Map the columns, check the preview, approve.
          </li>
          <li>
            Enter results with <Link to="/entry">Quick Entry</Link> (one at a time, with a live preview of what will change) or <Link to="/paste">Paste &amp; Match</Link> (whole results tables, the Tasuki line format below, Forms exports, or dictation).
          </li>
          <li>
            Print cards from <Link to="/cards">Cards &amp; Print</Link> (A4, 3 × 3, print at 100% scale) and show <Link to="/boards">Boards</Link> on the projector.
          </li>
          <li>
            Back up weekly: <Link to="/settings">Settings</Link> → Data → Export everything. The file contains dates of birth, so keep it private.
          </li>
        </ol>
        <p className="small muted">
          Trying it out first? Settings → Data → Load demo data adds invented athletes. Clear all demo data removes exactly those records.
        </p>
      </Panel>

      <Panel title="Weekly routine">
        <ul>
          <li>After each Circuit: paste or quick-enter the times (each Circuit time also counts the week for the streak).</li>
          <li>Saturday runs: <code># participation: saturday_run | date</code> then the names.</li>
          <li>Tick student-reported holiday results as verified once checked (unverified results never count).</li>
          <li>Print the In-Form cards for the week, and show the In-Form, Streak and RACE boards.</li>
          <li>Before the next Circuit, print the handicap start sheet.</li>
          <li>Export a backup.</li>
        </ul>
      </Panel>

      <Panel title="Tasuki line format">
        <Markdown source={lineFormat} />
      </Panel>

      <Panel title="How the ratings work">
        <h3>Run Score (40–99)</h3>
        <p>
          Every timed run is age-graded: the time is compared with the world-class standard for the runner&apos;s age and sex at that distance. Effective distance adds climb: distance + climb ÷ 100 (so 4 km with 200 m of climb counts as 6 km), times the course terrain factor. An age grade of {pct(c.runScore.anchorAG)} (&ldquo;national class&rdquo;) scores 99. A Year 7 and a Year 13 who run equally well for their age get the same score.
        </p>
        <p className="small muted">
          Standards: {isAgeGradeProvisional(c) ? 'provisional fallback table (ratings marked provisional).' : `Alan Jones 2025 road tables, commit ${AGE_GRADE_SOURCE.commit.slice(0, 7)}.`}
        </p>
        <h3>Freshness</h3>
        <p>
          Results up to {c.freshness.decayGraceMonths} months old count in full. After that a stat loses {c.freshness.decayPointsPerMonth} point a month, and results older than {c.freshness.expireMonths} months leave the current ratings (they stay in the Career Vault and PB lists forever). Cards show the date of the result behind each stat.
        </p>
        <h3>Growth Shield</h3>
        <p>
          While a runner&apos;s streak is active (or frozen), no stat shows more than {c.growthShield.margin} below its best in the last {c.growthShield.windowMonths} months. Growth spurts and off days do not knock a committed runner back.
        </p>
        <h3>The stats</h3>
        <ul>
          <li><strong>RACE</strong> (headline banner): best three race, relay-leg and parkrun scores weighted 50/30/20. Not part of OVR. ★ = race caps.</li>
          <li><strong>SPD</strong>: best Campus Circuit score.</li>
          <li><strong>END</strong>: the better of the bleep test rating and the best race or long run of {c.end.longRunMinKmEff} km or more. The card says which.</li>
          <li><strong>CLB / DSC</strong>: climb and descent courses. A descent that is not a clean run is kept but never scored.</li>
          <li><strong>NAV</strong> (provisional): navigation time against a prediction from the runner&apos;s own best Circuit pace, with {c.nav.penaltySecPerError} s per control error.</li>
          <li><strong>ARM</strong> (provisional): ankle, calf and balance tests, levels 1–5 each, using the best level in the last {c.arm.windowMonths} months, so ARM never falls on a bad retest.</li>
          <li><strong>OVR</strong>: the average of the unlocked stats (shown as n/6). A locked stat shows a lock and how to unlock it, never a number.</li>
        </ul>
        <h3>Tiers</h3>
        <p>
          Bronze below {c.tiers.silverMin}; Silver {c.tiers.silverMin}–{c.tiers.goldMin - 1}; Gold {c.tiers.goldMin}+ with at least {c.tiers.goldMinCaps} race cap; Icon: {c.tiers.iconMinCaps}+ race caps and RACE {c.tiers.iconMinRace}+. In-Form cards (a PB in the last {c.inForm.days} days) get a special style for the week.
        </p>
        <h3>Fairness and safety</h3>
        <p>
          Racing more earns caps and badges, never rating points. Improvement (In-Form, Tasuki Surge) and turning up (streaks) are rewarded on their own boards, and never inflate ability ratings. Provisional ratings carry a small <span className="prov">prov</span> marker in the coach view only (never on printed cards).
        </p>
      </Panel>

      <Panel title="Privacy">
        <p>
          Everything stays in this browser on this laptop: no accounts, no network. Dates of birth are coach-only and never appear on cards, boards or printouts. Each athlete&apos;s display mode (full name, first name + initial, or a public alias) controls how they appear on cards and boards, and an athlete can opt out of the absolute leaderboards.
        </p>
      </Panel>
    </div>
  );
}
