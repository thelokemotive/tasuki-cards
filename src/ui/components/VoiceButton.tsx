// Dictation into the Paste-and-Match box (spec 4.4). Uses the browser's Web Speech API (en-GB or
// ja-JP). Always produces a draft for review, never a saved result. No audio is stored by this app.
// Hidden where the API is unsupported.
import { useEffect, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognitionCtor(): (new () => Recognition) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && !!recognitionCtor();
}

export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [lang, setLang] = useState<'en-GB' | 'ja-JP'>(() => {
    try {
      return (localStorage.getItem('tasuki.voiceLang') as 'en-GB' | 'ja-JP') || 'en-GB';
    } catch {
      return 'en-GB';
    }
  });
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.stop(), []);
  if (!isVoiceSupported()) return null;

  const start = () => {
    const Ctor = recognitionCtor()!;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onText(res[0].transcript.trim());
      }
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone permission was refused' : e.error === 'network' ? 'Dictation needs the browser’s speech service (internet)' : `Dictation error: ${e.error}`);
    r.onend = () => setOn(false);
    setError(null);
    r.start();
    rec.current = r;
    setOn(true);
  };

  return (
    <span className="row" style={{ gap: 6 }}>
      <select
        className="select"
        style={{ width: 'auto', padding: '5px 6px' }}
        value={lang}
        onChange={(e) => {
          const v = e.target.value as 'en-GB' | 'ja-JP';
          setLang(v);
          try {
            localStorage.setItem('tasuki.voiceLang', v);
          } catch {
            /* per-viewer convenience only */
          }
        }}
        aria-label="Dictation language"
      >
        <option value="en-GB">English</option>
        <option value="ja-JP">日本語</option>
      </select>
      <button type="button" className={`btn ${on ? 'btn-accent' : ''}`} onClick={() => (on ? rec.current?.stop() : start())} title="Dictate results: “Aiko Testfield sixteen fifteen”. Each phrase becomes a line to review.">
        {on ? '■ Stop' : '🎤 Dictate'}
      </button>
      {error && <span className="small" style={{ color: 'var(--err)' }}>{error}</span>}
    </span>
  );
}
