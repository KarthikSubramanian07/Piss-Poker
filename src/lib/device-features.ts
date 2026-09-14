import { useEffect } from 'react';
import { soundEnabled } from './device';

/** Keeps the screen on while a table is open. Browsers drop the lock when the tab hides, so it is re-requested. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      if (disposed || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // denied (battery saver or no user gesture yet); retried on the next interaction
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    document.addEventListener('pointerdown', request);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', request);
      document.removeEventListener('pointerdown', request);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

let audio: AudioContext | null = null;

export function unlockAudio() {
  if (audio) {
    if (audio.state === 'suspended') void audio.resume();
    return;
  }
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) audio = new Ctx();
}

/** Two soft rising tones, plus a vibration on devices that support it. */
export function turnAlert() {
  navigator.vibrate?.([40, 70, 40]);
  if (!soundEnabled() || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}
