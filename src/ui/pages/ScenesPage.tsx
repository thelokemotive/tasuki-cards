// Scenes gallery (#/scenes): every Yama mood, wide and tall. A design reference, not in the menu.
import { YamaScene, type SceneMood } from '../art/YamaScene';
import { PageHeader, Panel } from '../components/common';

const MOODS: SceneMood[] = ['spring', 'summer', 'autumn', 'winter', 'night', 'dawn'];

export function ScenesPage() {
  return (
    <div className="stack">
      <PageHeader title="Scenes" subtitle="The Yama landscapes used on cards, the home page and the projector." />
      <Panel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {MOODS.map((m) => (
            <figure key={m} style={{ margin: 0 }}>
              <YamaScene mood={m} style={{ width: '100%', height: 170, display: 'block', borderRadius: 10 }} />
              <figcaption className="small muted">{m}</figcaption>
            </figure>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          {MOODS.map((m, i) => (
            <YamaScene key={m} mood={m} shape="tall" seed={i + 3} risingSun={m === 'dawn'} style={{ width: 150, height: 210, display: 'block', borderRadius: 8 }} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
