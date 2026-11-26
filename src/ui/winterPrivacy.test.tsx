// @vitest-environment jsdom
// §13.12: no board, projector view or batch print shows frost, freezes, "!" or individual winter counts; and the
// pupils' published copy holds none of it. Fictional (demo) runners only.
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { DataSnapshot, Participation, Performance } from '../types';
import { buildDemoData } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { cloneConfig, DEFAULT_CONFIG } from '../engine/config';
import { deriveAll } from '../engine/derive';
import { addDays, isoWeek } from '../engine/dates';
import { BOARD_IDS, buildBoard } from '../engine/boards';
import { makePublicPack } from '../cloud/publicPack';
import { BoardView } from './boards/BoardView';
import { PrintSheets } from './cards/PrintSheet';
import { buildCardData } from './cards/cardData';
import { EkidenBoard, boardWeek } from './pages/EkidenPage';
import { GymSheets } from './cards/GymSheet';
import { gymSheetRows } from '../engine/gymSheet';
import { displayName } from '../engine/display';

const ASOF = '2027-01-20';
const config = cloneConfig(DEFAULT_CONFIG);
config.winter.kmPerSession = 0.55;

function winterSnapshot(): DataSnapshot {
  const demo = buildDemoData('2026-11-13');
  const snap: DataSnapshot = { ...emptySnapshot(), ...demo, configs: [config] };
  const ids = snap.athletes.filter((a) => a.active && a.yearGroup !== 'Staff').map((a) => a.id);
  const perfs: Performance[] = [];
  const parts: Participation[] = [];
  let n = 0;
  const gym = (athleteId: string, date: string, card: string, tier: 1 | 2 | 3 | undefined, hurt = false) =>
    perfs.push({ id: `gym-t-${n++}`, athleteId, date, kind: 'gym_session', gym: { card, tier, hurt, holiday: false }, verified: true, source: 'sheet', rawInput: `${card}${tier ?? ''}${hurt ? '!' : ''}`, history: [] });
  ids.forEach((id, i) => {
    gym(id, '2026-12-07', 'E', 1);
    gym(id, '2026-12-09', 'A', 2, i === 0);
    // Half the squad misses 11 Jan (frosted); the others qualify, one with 5 sessions.
    if (i % 2 === 0) for (let k = 0; k < (i === 2 ? 5 : 2); k++) gym(id, addDays('2027-01-11', k), 'X', 3);
    if (i === 1) parts.push({ id: 'rf1', athleteId: id, isoWeek: isoWeek('2027-01-11'), type: 'freeze', date: '2027-01-11', freezeKind: 'self_rf' });
    if (i === 3) parts.push({ id: 'med1', athleteId: id, isoWeek: isoWeek('2027-01-11'), type: 'freeze', date: '2027-01-11', freezeKind: 'medical' });
  });
  return { ...snap, performances: [...snap.performances, ...perfs], participation: [...snap.participation, ...parts] };
}

const BANNED = [/frost/i, /freez/i, /frozen/i, /!/, /\bRF\b/, /Winter Shield/i, /medical/i, /recovery/i, /hurt/i];

describe('§13.12 rendered text: boards, projector and batch prints', () => {
  const snap = winterSnapshot();
  const derived = deriveAll(snap, ASOF, config);

  it('the fixture really has frost, freezes and "!" to hide', () => {
    const whites = [...derived.athletes.values()].map((d) => d.white).filter(Boolean);
    expect(whites.some((w) => w!.frosted)).toBe(true);
    expect(whites.some((w) => w!.weeks.some((x) => x.neutralBy === 'medical'))).toBe(true);
    expect(whites.some((w) => w!.weeks.some((x) => x.entries.some((e) => e.hurt)))).toBe(true);
  });

  it('no board (screen, projector or print) shows any of it', () => {
    for (const id of BOARD_IDS) {
      for (const variant of ['screen', 'projector', 'print'] as const) {
        const { container, unmount } = render(<BoardView board={buildBoard(id, derived)} variant={variant} />);
        const text = container.textContent ?? '';
        for (const re of BANNED) expect(text, `${id}/${variant} matched ${re}`).not.toMatch(re);
        unmount();
      }
    }
  });

  it('the Winter Ekiden board shows team numbers only', () => {
    const name = (id: string) => displayName(snap.athletes.find((a) => a.id === id)!);
    const bw = boardWeek(derived.ekiden!, '2027-W02', config, name)!;
    for (const big of [false, true]) {
      const { container, unmount } = render(<EkidenBoard bw={bw} config={config} big={big} />);
      const text = container.textContent ?? '';
      for (const re of BANNED) expect(text).not.toMatch(re);
      expect(text).not.toMatch(/Move the pin/);
      // No runner's own session count: the only names are Comeback Thaws.
      for (const d of derived.athletes.values()) if (d.white && !bw.thawNames.includes(name(d.athlete.id))) expect(text).not.toContain(name(d.athlete.id));
      unmount();
    }
  });

  it('batch-printed cards and the Gym Log sheet show none of it', () => {
    const cards = [...derived.athletes.values()].filter((d) => d.athlete.active).map(buildCardData);
    const { container, unmount } = render(<PrintSheets cards={cards} />);
    const text = container.textContent ?? '';
    for (const re of BANNED) expect(text).not.toMatch(re);
    expect(container.querySelector('[data-testid="frost"]')).toBeNull();
    unmount();
    const sheet = render(<GymSheets rows={gymSheetRows(snap.athletes)} weeks={['2027-W03']} config={config} />);
    const st = (sheet.container.textContent ?? '').replace('! something hurt', '').replace('RF recovery week', '');
    for (const re of BANNED) expect(st).not.toMatch(re);
    sheet.unmount();
  });

  it("the pupils' published copy holds no gym sessions, freezes, frost or flags", () => {
    const json = makePublicPack(snap, derived);
    for (const s of ['gym_session', 'freezeKind', '"frosted"', '"hurt"', '"white"', 'summitPass', 'winterBadges":[{', '"ekiden":{']) expect(json).not.toContain(s);
  });
});
