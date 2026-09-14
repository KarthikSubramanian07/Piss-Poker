import { bySeat } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';
import { Invite } from './Invite';

export function Lobby({ onSettings, onPlayers }: { onSettings: () => void; onPlayers: () => void }) {
  const { room, game, isHost, run, busy, v, away, member } = useTable();
  const seats = bySeat(game);
  const move = (index: number, delta: number) => {
    const ids = seats.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void run({ type: 'seatOrder', v, ids });
  };
  const { sb, bb, startingStack, buyInPrice } = game.settings;

  return (
    <div className="lobby">
      <Invite code={room.code} />

      <section className="lobby-section" aria-labelledby="lobby-players">
        <div className="section-head">
          <h2 id="lobby-players">
            Seats <span className="muted num">{seats.length}/10</span>
          </h2>
          {isHost && (
            <button className="link-btn" onClick={onPlayers}>
              Manage
            </button>
          )}
        </div>
        {seats.length === 0 ? (
          <p className="muted">Nobody has joined yet.</p>
        ) : (
          <ol className="lobby-seats">
            {seats.map((p, i) => {
              const m = member(p.id);
              return (
                <li key={p.id}>
                  <span className="seat-index num">{i + 1}</span>
                  <span className="lobby-name">
                    {p.name}
                    {room.hostId === p.id && <span className="tag">host</span>}
                    {i === 0 && <span className="tag">first button</span>}
                  </span>
                  <span className="muted small">{m?.manual ? 'no phone' : away(p.id) ? 'away' : ''}</span>
                  {isHost && seats.length > 1 && (
                    <span className="reorder">
                      <button className="icon-btn" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}>
                        <Icon name="up" size={18} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={i === seats.length - 1 || busy}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${p.name} down`}
                      >
                        <Icon name="down" size={18} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {isHost && seats.length > 1 && <p className="hint">Order seats the way you sit, clockwise from the dealer.</p>}
      </section>

      <section className="lobby-section" aria-labelledby="lobby-rules">
        <div className="section-head">
          <h2 id="lobby-rules">Game</h2>
          {isHost && (
            <button className="link-btn" onClick={onSettings}>
              Edit
            </button>
          )}
        </div>
        <dl className="facts">
          <div>
            <dt>Blinds</dt>
            <dd className="num">
              {fmt(sb)}/{fmt(bb)}
            </dd>
          </div>
          <div>
            <dt>Starting stack</dt>
            <dd className="num">{fmt(startingStack)}</dd>
          </div>
          <div>
            <dt>Buy-in</dt>
            <dd className="num">{buyInPrice > 0 ? `$${(buyInPrice / 100).toFixed(2)}` : 'Chips only'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
