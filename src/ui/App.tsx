// App shell: navigation, saved indicator, storage/backup banners and routes.
import './styles/app.css';
import { lazy, Suspense, type ReactNode } from 'react';
import { useAccount } from './cloud/account';
import { AccountMenu } from './cloud/AccountMenu';
import { DataProvider, useData } from './data/DataContext';
import { ToastProvider, useToast } from './components/Toast';
import { Link, useRoute, type Route } from './router';
import { backupOverdueDays, exportEverything } from './data/backup';
import { formatLongDate } from '../engine/dates';
import { BrandMark } from './components/BrandMark';
import { HomePage } from './pages/HomePage';
import { QuickEntryPage } from './pages/QuickEntryPage';
import { PastePage } from './pages/PastePage';
import { RosterPage } from './pages/RosterPage';
import { AthletePage } from './pages/AthletePage';
import { EventsPage } from './pages/EventsPage';
import { EventPage } from './pages/EventPage';
import { PrintStudioPage } from './pages/PrintStudioPage';
import { BoardsPage } from './pages/BoardsPage';
import { ProjectorPage } from './pages/ProjectorPage';
import { HandicapPage } from './pages/HandicapPage';
import { SettingsPage } from './pages/SettingsPage';
import { ScenesPage } from './pages/ScenesPage';
import { SquadPage } from './pages/SquadPage';
import { YamaScene } from './art/YamaScene';
import { HelpPage } from './pages/HelpPage';

interface NavItem {
  page: string;
  to: string;
  label: string;
  icon: string;
}

const NAV: (NavItem | 'sep')[] = [
  { page: 'home', to: '/', label: 'Home', icon: '⌂' },
  { page: 'entry', to: '/entry', label: 'Quick Entry', icon: '＋' },
  { page: 'paste', to: '/paste', label: 'Paste & Match', icon: '⇣' },
  'sep',
  { page: 'roster', to: '/roster', label: 'Roster', icon: '☰' },
  { page: 'squad', to: '/squad', label: 'Squad', icon: '▦' },
  { page: 'events', to: '/events', label: 'Events', icon: '⚑' },
  'sep',
  { page: 'cards', to: '/cards', label: 'Cards & Print', icon: '▣' },
  { page: 'boards', to: '/boards', label: 'Boards', icon: '≡' },
  { page: 'handicap', to: '/handicap', label: 'Handicap Start', icon: '⏱' },
  'sep',
  { page: 'settings', to: '/settings', label: 'Settings', icon: '⚙' },
  { page: 'help', to: '/help', label: 'Help', icon: '?' },
];

const TITLES: Record<string, string> = {
  home: 'Home',
  entry: 'Quick Entry',
  paste: 'Paste & Match',
  roster: 'Roster',
  squad: 'Squad',
  scenes: 'Scenes',
  athlete: 'Athlete',
  events: 'Events',
  event: 'Event',
  cards: 'Cards & Print Studio',
  boards: 'Boards',
  handicap: 'Circuit Handicap Start',
  settings: 'Settings',
  help: 'Help',
};

function renderPage(route: Route): ReactNode {
  switch (route.page) {
    case 'home':
      return <HomePage />;
    case 'entry':
      return <QuickEntryPage />;
    case 'paste':
      return <PastePage />;
    case 'roster':
      return <RosterPage />;
    case 'athlete':
      return <AthletePage />;
    case 'events':
      return <EventsPage />;
    case 'event':
      return <EventPage />;
    case 'cards':
      return <PrintStudioPage />;
    case 'boards':
      return <BoardsPage />;
    case 'handicap':
      return <HandicapPage />;
    case 'settings':
      return <SettingsPage />;
    case 'help':
      return <HelpPage />;
    case 'scenes':
      return <ScenesPage />;
    case 'squad':
      return <SquadPage />;
    default:
      return <HomePage />;
  }
}

// The website build only: sign-in and the shared database. `__WEB__` is false in the single file, so
// the bundler drops this import and the file stays free of network code.
const CloudGate = __WEB__ ? lazy(() => import('./cloud/CloudGate')) : null;

function SaveIndicator() {
  const { save, persistent } = useData();
  const shared = useAccount() != null;
  if (!persistent) return <span className="save-ind error"><span className="dot" />Not saving (memory only)</span>;
  if (save.error) return <span className="save-ind error" title={save.error}><span className="dot" />Save failed</span>;
  if (save.pending > 0) return <span className="save-ind saving"><span className="dot" />Saving…</span>;
  const at = save.lastSavedAt ? new Date(save.lastSavedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <span className="save-ind" title={shared ? 'Saved to the shared squad database (changes made offline sync when you are back online)' : 'Everything is saved in this browser (IndexedDB)'}>
      <span className="dot" />
      Saved{at ? ` ${at}` : ''}
    </span>
  );
}

function Banners() {
  const data = useData();
  const toast = useToast();
  const { snapshot, today, config, persistent, storageError, commit } = data;
  const overdue = backupOverdueDays(snapshot, today, config.backup.reminderDays);
  return (
    <>
      {!persistent && (
        <div className="banner err">
          <strong>Browser storage is unavailable.</strong> Changes are kept only until this tab closes. Use Settings → Data → Export to keep a copy.
          {storageError && <span className="tiny">({storageError})</span>}
        </div>
      )}
      {overdue != null && (
        <div className="banner warn no-print">
          <span>
            {overdue === Infinity ? 'You have not made a backup yet.' : `Your last backup was ${overdue} days ago.`} A weekly export keeps the season safe.
          </span>
          <button
            className="btn btn-sm"
            onClick={() => {
              commit(exportEverything(snapshot)).then(() => toast('Backup downloaded', 'ok'));
            }}
          >
            Export everything now
          </button>
        </div>
      )}
      {snapshot.meta.demoLoaded && (
        <div className="banner info no-print">
          Demo data is loaded (invented athletes). Clear it in Settings → Data before importing your roster.
        </div>
      )}
    </>
  );
}

function Shell() {
  const route = useRoute();
  const data = useData();
  if (route.page === 'projector') return <ProjectorPage />;
  const activePage = route.page === 'athlete' ? 'roster' : route.page === 'event' ? 'events' : route.page;
  return (
    <div className="shell">
      <nav className="nav no-print" aria-label="Main">
        <Link to="/" className="nav-brand">
          <BrandMark />
          <span className="nav-brand-text">
            Tasuki Cards
            <small>HARROW APPI TRAIL RUNNING</small>
          </span>
        </Link>
        {NAV.map((n, i) =>
          n === 'sep' ? (
            <div key={i} className="nav-sep" />
          ) : (
            <Link key={n.page} to={n.to} className={`nav-link ${activePage === n.page ? 'active' : ''}`}>
              <span className="nav-ico" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
            </Link>
          ),
        )}
        <div className="nav-foot">山 Yama · built {__BUILD_DATE__}</div>
        <div className="nav-stars" aria-hidden="true" />
        <div className="nav-scene" aria-hidden="true">
          <YamaScene mood="night" shape="tall" seed={3} trail={false} sky={false} />
        </div>
      </nav>
      <div className="main">
        <header className="topbar no-print">
          <div className="topbar-title">{TITLES[route.page] ?? 'Tasuki Cards'}</div>
          {data.asOf !== data.today && (
            <span className="asof-chip" title="Ratings are being computed for a different date (Settings → As-of date)">
              As of {formatLongDate(data.asOf)}
            </span>
          )}
          <SaveIndicator />
          <AccountMenu />
        </header>
        <Banners />
        <main className="content">{data.ready ? renderPage(route) : <p className="muted">Loading…</p>}</main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      {CloudGate ? (
        <Suspense fallback={null}>
          <CloudGate>
            <Shell />
          </CloudGate>
        </Suspense>
      ) : (
        <DataProvider>
          <Shell />
        </DataProvider>
      )}
    </ToastProvider>
  );
}
