// @vitest-environment jsdom
// White Season pages render with real data: Paste & Match (gym block and Form CSV), the Winter Ekiden board,
// the coach radar, Settings → White Season, the athlete page (frost, Winter Shield) and the Gym Log sheet.
import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DataSnapshot, Performance } from '../types';
import { buildDemoData } from '../demo/demoData';
import { emptySnapshot } from '../store/Store';
import { MemoryStore } from '../store/memoryStore';
import { cloneConfig, DEFAULT_CONFIG } from '../engine/config';
import { addDays } from '../engine/dates';
import { DataProvider, useData } from './data/DataContext';
import { ToastProvider } from './components/Toast';
import { PastePage } from './pages/PastePage';
import { EkidenPage } from './pages/EkidenPage';
import { RadarPage } from './pages/RadarPage';
import { WhiteSeasonTab } from './pages/settings/WhiteSeasonTab';
import { AthletePage } from './pages/AthletePage';
import { PrintStudioPage } from './pages/PrintStudioPage';

const config = cloneConfig(DEFAULT_CONFIG);
config.winter.kmPerSession = 0.55;

function snap(): DataSnapshot {
  const demo = buildDemoData('2026-11-13');
  const s: DataSnapshot = { ...emptySnapshot(), ...demo, configs: [config] };
  const ids = s.athletes.filter((a) => a.active && a.yearGroup !== 'Staff').map((a) => a.id);
  const perfs: Performance[] = [];
  ids.forEach((id, i) => {
    for (const d of ['2026-12-07', '2026-12-09']) perfs.push({ id: `g-${id}-${d}`, athleteId: id, date: d, kind: 'gym_session', gym: { card: 'E', tier: 1, hurt: i === 0, holiday: false }, verified: true, source: 'sheet', rawInput: '', history: [] });
    if (i % 2) for (const k of [0, 2]) perfs.push({ id: `g2-${id}-${k}`, athleteId: id, date: addDays('2027-01-11', k), kind: 'gym_session', gym: { card: 'A', tier: 2, hurt: false, holiday: false }, verified: true, source: 'sheet', rawInput: '', history: [] });
  });
  return { ...s, performances: [...s.performances, ...perfs] };
}

/** Views the data as of a winter date (the real today is before White Season). */
function AsOf({ date, children }: { date: string; children: React.ReactNode }) {
  const { setAsOf, asOf, ready } = useData();
  useEffect(() => setAsOf(date), [date, setAsOf]);
  return ready && asOf === date ? <>{children}</> : null;
}

function wrap(ui: React.ReactNode, s = snap()) {
  return (
    <ToastProvider>
      <DataProvider storeOverride={new MemoryStore(s)}>
        <AsOf date="2027-01-20">{ui}</AsOf>
      </DataProvider>
    </ToastProvider>
  );
}

afterEach(cleanup);

describe('White Season pages', () => {
  it('Paste & Match shows the gym review for a Gym Log block', async () => {
    const s = snap();
    const a = s.athletes[0];
    window.location.hash = `#/paste?text=${encodeURIComponent(`# gym | 2027-01-18\n${a.givenName} ${a.familyName} | Mon A2 | Wed E1! | Fri Q2`)}`;
    render(wrap(<PastePage />, s));
    await waitFor(() => expect(screen.getByTestId('gym-review')).toBeTruthy());
    expect(screen.getByTestId('approve-gym').textContent).toMatch(/Approve 2 items/);
    expect(document.body.textContent).toMatch(/Unknown code “Q2”/);
  });

  it('Paste & Match maps a holiday Form CSV', async () => {
    const s = snap();
    const a = s.athletes[1];
    const csv = `ID,Start time,Completion time,Email,Name,Date of session,What did you do?,Which level?,Did anything hurt?\n7,x,x,a@school.example,"${a.familyName}, ${a.givenName}",22/12/2026,Holiday Express,Base,No`;
    window.location.hash = `#/paste?text=${encodeURIComponent(csv)}`;
    render(wrap(<PastePage />, s));
    await waitFor(() => expect(screen.getByText(/Holiday Form columns/)).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('approve-gym').textContent).toMatch(/Approve 1 item/));
  });

  it('the Winter Ekiden board, with the pin line and the weekly post', async () => {
    window.location.hash = '#/ekiden?week=2027-W02';
    render(wrap(<EkidenPage />));
    await waitFor(() => expect(screen.getByTestId('ekiden-board')).toBeTruthy());
    expect(screen.getByTestId('pin-line').textContent).toMatch(/Move the pin to \d+\.\d km \(\d+\.\d km before /);
    expect(screen.getByTestId('copy-post')).toBeTruthy();
  });

  it('the coach radar lists the "!" entry', async () => {
    render(wrap(<RadarPage />));
    await waitFor(() => expect(screen.getByText(/Something hurt/)).toBeTruthy());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2026-W50' } });
    await waitFor(() => expect(screen.getByText(/Something hurt \(“!”\) \(1\)/)).toBeTruthy());
  });

  it('Settings → White Season suggests km per session and lists the winter roster', async () => {
    render(wrap(<WhiteSeasonTab />));
    await waitFor(() => expect(screen.getByText(/Winter roster/)).toBeTruthy());
    expect(screen.getByTestId('confirm-kps')).toBeTruthy();
  });

  it('the athlete page shows the Winter Shield and the frost border for a frosted runner', async () => {
    const s = snap();
    const frosted = s.athletes.filter((a) => a.active && a.yearGroup !== 'Staff')[0];
    window.location.hash = `#/athlete/${frosted.id}`;
    render(wrap(<AthletePage />, s));
    await waitFor(() => expect(screen.getByTestId('winter-shield')).toBeTruthy());
    expect(screen.getAllByTestId('frost').length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/FROSTED · one good week thaws it/);
  });

  it('the Gym Log sheet renders in the Print Studio', async () => {
    window.location.hash = '#/cards?sheet=gym';
    render(wrap(<PrintStudioPage />));
    await waitFor(() => expect(document.querySelector('.gym-page')).toBeTruthy());
    expect(document.body.textContent).toMatch(/Runners' Gym Log · week of Mon/);
  });
});
