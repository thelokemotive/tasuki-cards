// Settings (spec 8, 9): data (export/import/demo), courses, calendar, scoring constants.
import { PageHeader, Seg } from '../components/common';
import { navigate, useRoute } from '../router';
import { DataTab } from './settings/DataTab';
import { CoursesTab } from './settings/CoursesTab';
import { CalendarTab } from './settings/CalendarTab';
import { ScoringTab } from './settings/ScoringTab';

type Tab = 'data' | 'courses' | 'calendar' | 'scoring';

export function SettingsPage() {
  const route = useRoute();
  const tab = (route.query.get('tab') as Tab) || 'data';
  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Data and backups, courses and benchmarks, the school calendar, and every scoring constant." />
      <div className="no-print">
        <Seg<Tab>
          value={tab}
          onChange={(t) => navigate(`/settings?tab=${t}`)}
          options={[
            { value: 'data', label: 'Data & backups' },
            { value: 'courses', label: 'Courses' },
            { value: 'calendar', label: 'Calendar' },
            { value: 'scoring', label: 'Scoring constants' },
          ]}
        />
      </div>
      {tab === 'data' && <DataTab />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'scoring' && <ScoringTab />}
    </div>
  );
}
