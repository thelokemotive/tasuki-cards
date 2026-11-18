// Coach's shortcut in Quick Entry: read a treadmill console photo into the form.
import './treadmill.css';
import { useEffect, useRef, useState } from 'react';
import type { TreadmillReading } from '../../engine/treadmill/read';
import { readPhoto } from './photo';

export function TreadmillPhotoButton({ onRead }: { onRead: (r: TreadmillReading) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ url: string; text: string } | null>(null);
  useEffect(() => () => void (note?.url && URL.revokeObjectURL(note.url)), [note]);
  return (
    <div className="tm-read">
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden aria-label="Photo of the treadmill console"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const r = await readPhoto(f);
            onRead(r.reading);
            setNote({ url: r.previewUrl, text: r.reading.warnings.join(' ') || 'Read from the photo: check the numbers below against it.' });
          } catch (err) {
            setNote({ url: '', text: `Could not open the photo: ${err instanceof Error ? err.message : String(err)}` });
          } finally {
            setBusy(false);
            if (ref.current) ref.current.value = '';
          }
        }}
      />
      <button className="btn" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? 'Reading…' : '📷 Read a treadmill photo'}
      </button>
      {note && (
        <>
          {note.url && <img src={note.url} alt="The treadmill display" className="tm-crop" style={{ maxWidth: 200 }} />}
          <span className="small muted">{note.text}</span>
        </>
      )}
    </div>
  );
}
