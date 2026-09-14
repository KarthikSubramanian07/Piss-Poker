import { bySeat, type Player } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';

export function seatStatus(p: Player, phase: string, away: boolean, manual: boolean): string | null {
  const inHand = (phase === 'betting' || phase === 'showdown') && p.inHand;
  if (p.leaving) return 'left';
  if (inHand && p.folded) return 'folded';
  if (inHand && p.allIn) return 'all in';
  if (!inHand && (phase === 'betting' || phase === 'showdown')) {
    if (p.stack === 0) return 'out of chips';
    return p.sittingOut ? 'sitting out' : 'next hand';
  }
  if (p.stack === 0 && phase !== 'lobby') return 'out of chips';
  if (p.sittingOut) return 'sitting out';
  if (manual) return 'no phone';
  if (away) return 'away';
  return null;
}

export function Seats({ compact = false }: { compact?: boolean }) {
  const { game, you, member, away } = useTable();
  const hand = game.phase === 'betting' || game.phase === 'showdown';

  return (
    <ul className={`seats${compact ? ' seats-compact' : ''}`} aria-label="Players">
      {bySeat(game).map((p) => {
        const m = member(p.id);
        const status = seatStatus(p, game.phase, away(p.id), !!m?.manual);
        const acting = game.toActId === p.id;
        const dim = hand && (!p.inHand || p.folded);
        const tags = [
          game.buttonId === p.id && hand ? 'D' : null,
          game.sbId === p.id && hand ? 'SB' : null,
          game.bbId === p.id && hand ? 'BB' : null,
        ].filter(Boolean) as string[];
        const won = game.phase === 'done' ? game.results.filter((r) => r.id === p.id).reduce((s, r) => s + r.amount, 0) : 0;
        return (
          <li
            key={p.id}
            className="seat"
            data-acting={acting || undefined}
            data-dim={dim || undefined}
            data-you={p.id === you.id || undefined}
            aria-current={acting ? 'true' : undefined}
          >
            <span className="seat-mark" aria-hidden="true" />
            <div className="seat-who">
              <span className="seat-name">
                {p.name}
                {p.id === you.id && <span className="seat-you">you</span>}
              </span>
              <span className="seat-meta">
                {tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                {status && <span className="seat-status">{status}</span>}
                {acting && <span className="seat-status seat-acting">to act</span>}
              </span>
            </div>
            <span className="seat-bet num">
              {hand && p.bet > 0 ? fmt(p.bet) : won > 0 ? <span className="won">+{fmt(won)}</span> : ''}
            </span>
            <span className="seat-stack num">{fmt(p.stack)}</span>
          </li>
        );
      })}
    </ul>
  );
}
