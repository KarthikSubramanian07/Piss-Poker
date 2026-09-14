import { useEffect, useState } from 'react';

export const toast = (message: string) => window.dispatchEvent(new CustomEvent('pp:toast', { detail: message }));

export function Toaster() {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const show = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      setMessage({ text, id: Date.now() });
      clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 3200);
    };
    window.addEventListener('pp:toast', show);
    window.addEventListener('pp:error', show);
    return () => {
      window.removeEventListener('pp:toast', show);
      window.removeEventListener('pp:error', show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {message && (
        <div className="toast" key={message.id}>
          {message.text}
        </div>
      )}
    </div>
  );
}
