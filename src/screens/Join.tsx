import { useState, type FormEvent } from 'react';
import { saveName, savedName } from '../lib/device';
import { unlockAudio } from '../lib/device-features';
import { useTable } from '../lib/table';

export function Join({ onDisplay }: { onDisplay: () => void }) {
  const { room, game, you, run, busy, away } = useTable();
  const [name, setName] = useState(savedName);
  const pendingClaim = room.claims.find((c) => c.id === you.claimId);
  const full = room.members.length >= 10;

  const join = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    await run({ type: 'join', name: trimmed });
  };

  const status =
    game.phase === 'lobby'
      ? room.members.length === 0
        ? 'Nobody here yet. Poker for one is just solitaire.'
        : `${room.members.length} waiting to start`
      : `Hand ${game.handNo} in progress`;

  if (pendingClaim) {
    return (
      <main className="join">
        <div className="join-card">
          <p className="join-code">{room.code}</p>
          <h1 className="join-title">Asking the table</h1>
          <p className="muted">
            Someone at the table needs to approve moving the seat of{' '}
            <strong>{room.members.find((m) => m.id === pendingClaim.playerId)?.name}</strong> to this device.
          </p>
          <div className="waiting-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <button className="btn btn-quiet btn-lg" onClick={() => run({ type: 'cancelClaim' })}>
            Cancel
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="join">
      <div className="join-card">
        <p className="join-code">{room.code}</p>
        <h1 className="join-title">Take a seat</h1>
        <p className="muted">{status}</p>

        <form className="stack-form" onSubmit={join}>
          <label htmlFor="name" className="field-label">
            Your name
          </label>
          <input
            id="name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="What the table calls you"
            autoFocus
          />
          <button className="btn btn-primary btn-xl" disabled={!name.trim() || busy || full}>
            {full ? 'Table is full' : 'Join table'}
          </button>
        </form>

        {room.members.length > 0 && (
          <section className="rejoin">
            <h2 className="field-label">Already sitting here on another device?</h2>
            <ul className="chip-list">
              {room.members.map((m) => (
                <li key={m.id}>
                  <button className="chip" onClick={() => run({ type: 'claim', playerId: m.id })} disabled={busy}>
                    {m.name}
                    {away(m.id) && <span className="chip-note">{m.manual ? 'no phone' : 'away'}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className="link-btn" onClick={onDisplay}>
          Use this screen as the table display
        </button>
      </div>
    </main>
  );
}
