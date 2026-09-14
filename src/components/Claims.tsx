import { useTable } from '../lib/table';

export function Claims() {
  const { room, run, busy, nameOf, you } = useTable();
  if (!you.id || room.claims.length === 0) return null;
  const claim = room.claims[0];
  return (
    <div className="claim" role="alertdialog" aria-labelledby="claim-text">
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
