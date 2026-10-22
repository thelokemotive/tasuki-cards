// Settings → Scoring constants. Placeholder until Milestone 6 (editor + impact preview).
import { Panel } from '../../components/common';
import { useData } from '../../data/DataContext';

export function ScoringTab() {
  const { config } = useData();
  return (
    <Panel title={`Scoring constants (config version ${config.version})`}>
      <p className="muted">The editor with an impact preview arrives in Milestone 6. Current values:</p>
      <pre style={{ maxHeight: 420 }}>{JSON.stringify(config, null, 2)}</pre>
    </Panel>
  );
}
