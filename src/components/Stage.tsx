import type { ReactNode } from 'react';
import { findPlayer, livePlayers, potTotal } from '../../shared/engine';
import { fmt, NEXT_CARDS } from '../lib/format';
import { useTable } from '../lib/table';

export function Stage() {
  const { game, you, nameOf, room } = useTable();
  const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
  const actor = findPlayer(game, game.toActId);
  const freshStreet = game.phase === 'betting' && game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0;

  let line: ReactNode = null;
  if (game.phase === 'betting' && actor) {
    const toCall = game.currentBet - actor.bet;
    const who = actor.id === you.id ? 'You' : actor.name;
    line = (
      <>
        {freshStreet && <span className="deal-hint">{NEXT_CARDS[game.street]}</span>}
        <span>
          {who} to act{toCall > 0 ? ` · ${fmt(toCall)} to call` : ''}
        </span>
      </>
    );
  } else if (game.phase === 'showdown') {
    line = <span>{game.runout ? 'All in. Run out the board.' : 'Show your cards.'}</span>;
  } else if (game.phase === 'done') {
    const winners = [...new Set(game.results.map((r) => r.id))];
    line = <span>{winners.length ? `${winners.map(nameOf).join(' and ')} ${winners.length > 1 ? 'split it' : 'takes it'}` : 'Hand over'}</span>;
  }

  const last = room.log.at(-1);
  const live = livePlayers(game).length;

  return (
    <section className="stage" aria-label="Pot">
      <div className="pot">
        <span className="label">{game.phase === 'done' ? 'Paid out' : 'Pot'}</span>
        <span className="pot-amount num" key={pot}>
          {fmt(pot)}
        </span>
        <div className="stage-line">{line}</div>
      </div>
      {game.phase === 'showdown' && game.pots.length > 1 && (
        <ul className="pot-breakdown">
          {game.pots.map((p, i) => (
            <li key={p.id}>
              <span>{i === 0 ? 'Main' : `Side ${i}`}</span>
              <span className="num">{fmt(p.amount)}</span>
              <span className="muted">{p.paid ? 'returned' : `${p.eligible.length} in`}</span>
            </li>
          ))}
        </ul>
      )}
      {game.phase === 'betting' && last && (
        <p className="last-action" key={last.id}>
          {last.text}
          {live > 0 && <span className="muted"> · {live} in hand</span>}
        </p>
      )}
    </section>
  );
}
