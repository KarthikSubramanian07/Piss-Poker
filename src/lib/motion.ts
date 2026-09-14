import { useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rolls a number toward its new value with an exponential ease out. */
export function useTweened(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value || prefersReducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const eased = k === 1 ? 1 : 1 - 2 ** (-10 * k);
      const next = k === 1 ? value : Math.round(from + (value - from) * eased);
      current.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return shown;
}

/** Briefly sets a flag whenever an action is rejected, for a quick shake. */
export function useShake() {
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const onReject = () => {
      setShaking(false);
      requestAnimationFrame(() => setShaking(true));
      clearTimeout(timer);
      timer = window.setTimeout(() => setShaking(false), 400);
    };
    window.addEventListener('pp:reject', onReject);
    return () => {
      window.removeEventListener('pp:reject', onReject);
      clearTimeout(timer);
    };
  }, []);
  return shaking;
}
