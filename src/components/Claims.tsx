import { useEffect, useRef } from 'react';
import { useTable } from '../lib/table';

export function Claims() {
  const { room, run, busy, nameOf, you } = useTable();
  const rootRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const claim = you.id && room.claims.length > 0 ? room.claims[0] : null;
  const claimId = claim?.id;

  useEffect(() => {
    if (!claimId) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    const focusable = root?.querySelectorAll<HTMLElement>('button:not([disabled])');
    focusable?.[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root) return;
      const list = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus.current?.focus?.();
    };
  }, [claimId]);

  if (!claim) return null;

  return (
    <div ref={rootRef} className="claim" role="alertdialog" aria-modal="true" aria-labelledby="claim-text">
      <p id="claim-text">
        A new device wants to take <strong>{nameOf(claim.playerId)}</strong>’s seat.
      </p>
      <div className="claim-actions">
        <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'resolveClaim', claimId: claim.id, allow: false })}>
          Deny
        </button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run({ type: 'resolveClaim', claimId: claim.id, allow: true })}>
          Allow
        </button>
      </div>
    </div>
  );
}
