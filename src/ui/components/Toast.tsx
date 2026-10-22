import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'info' | 'ok' | 'err';
interface ToastItem {
  id: number;
  text: string;
  kind: Kind;
}

const ToastCtx = createContext<(text: string, kind?: Kind) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = nextId++;
    setItems((xs) => [...xs, { id, text, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'err' ? 8000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** const toast = useToast(); toast('Saved 12 results', 'ok') */
export function useToast() {
  return useContext(ToastCtx);
}
