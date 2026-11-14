// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { buildDemoData } from '../../demo/demoData';
import { emptySnapshot } from '../../store/Store';
import { ViewOnlyStore } from '../../store/memoryStore';
import { DEFAULT_CONFIG } from '../../engine/config';
import { deriveAll } from '../../engine/derive';
import { makePublicPack, readPublicPack } from '../../cloud/publicPack';
import { DataProvider } from '../data/DataContext';
import { ToastProvider } from '../components/Toast';
import { ViewerHome } from './ViewerHome';
import { AthletePage } from '../pages/AthletePage';

describe('view-only website (pupils)', () => {
  const snap = { ...emptySnapshot(), ...buildDemoData('2026-11-13'), configs: [DEFAULT_CONFIG] };
  const pub = readPublicPack(makePublicPack(snap, deriveAll(snap, '2026-11-13', DEFAULT_CONFIG)));
  const wrap = (ui: React.ReactNode) => (
    <ToastProvider>
      <DataProvider storeOverride={new ViewOnlyStore(pub.snapshot)} derivedOverride={pub.derived}>
        {ui}
      </DataProvider>
    </ToastProvider>
  );

  it('shows every active runner\'s card, and a runner\'s own sheet', async () => {
    const { container, unmount } = render(wrap(<ViewerHome />));
    await waitFor(() => expect(container.querySelectorAll('.viewer-card').length).toBe(snap.athletes.filter((a) => a.active).length));
    unmount();
    const id = pub.snapshot.athletes[0].id;
    window.location.hash = `#/athlete/${id}/share`;
    render(wrap(<AthletePage />));
    await waitFor(() => expect(screen.getAllByText(/how your ratings are worked out/i).length).toBeGreaterThan(0));
  });
});
