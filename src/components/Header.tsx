import { STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';

export function Header({ onInvite, onMenu }: { onInvite: () => void; onMenu: () => void }) {
  const { room, game, conn } = useTable();
  const phase =
    game.phase === 'lobby'
      ? 'Lobby'
      : game.phase === 'betting'
        ? STREET_NAMES[game.street]
        : game.phase === 'showdown'
          ? 'Showdown'
          : 'Hand over';
  const online = conn.status === 'open';

  return (
    <header className="topbar">
      <button className="code-btn" onClick={onInvite} aria-label={`Table ${room.code}. Invite players`}>
        <span className="mono">{room.code}</span>
      </button>
      <div className="topbar-phase" aria-live="polite">
        {game.handNo > 0 && <span className="muted">Hand {game.handNo}</span>}
        {game.handNo === 69 && (
          <span className="nice" aria-hidden="true">
            nice
          </span>
        )}
        <span className="phase-name" key={phase}>
          {phase}
        </span>
      </div>
      <div className="topbar-end">
        <span className="conn" data-online={online} title={online ? 'Connected' : 'Reconnecting'} role="img" aria-label={online ? 'Connected' : 'Reconnecting'} />
        <button className="icon-btn" onClick={onMenu} aria-label="Menu">
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
