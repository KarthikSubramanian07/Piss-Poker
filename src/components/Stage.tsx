import type { ReactNode } from 'react';
import { findPlayer, potTotal, type Game } from '../../shared/engine';
import { fmt, NEXT_CARDS } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';

export function outcomeLine(game: Game, nameOf: (id: string) => string) {
  const winners = [...new Set(game.results.map((r) => r.id))];
  if (winners.length === 0) return 'Hand over';
  const names = winners.map(nameOf);
  if (winners.length > 1) {
    const contested = game.pots.filter((pot) => pot.eligible.length > 1);
    const everyPotSplit = contested.every((pot) => game.results.filter((r) => r.potId === pot.id).length > 1);
    return everyPotSplit ? `${names.join(' and ')} chop it` : `${names.join(' and ')} take pots`;
  }
  const folders = game.players.filter((p) => p.folded).length;
  const walk = game.street === 0 && winners[0] === game.bbId && folders === game.players.length - 1 && game.lastAction?.kind === 'fold';
  return walk ? `A walk for ${names[0]}` : `${names[0]} takes it`;
}

export function Stage() {
  const { game, you, nameOf, room } = useTable();
  const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
  const actor = findPlayer(game, game.toActId);
  const freshStreet =
    game.phase === 'betting' && game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0;

  let line: ReactNode = null;
  let lineKey: string = game.phase;
  if (game.phase === 'betting' && actor) {
    const toCall = game.currentBet - actor.bet;
    lineKey = `${game.street}-${actor.id}`;
    line = (
      <>
        {freshStreet && <span className="deal-hint">{NEXT_CARDS[game.street]}</span>}
        <span>
          {actor.id === you.id ? 'You' : actor.name} to act{toCall > 0 ? ` · ${fmt(toCall)} to call` : ''}
        </span>
      </>
    );
  } else if (game.phase === 'showdown') {
    line = <span>{game.runout ? 'All in. Run it out.' : 'Cards up.'}</span>;
  } else if (game.phase === 'done') {
    line = <span>{outcomeLine(game, nameOf)}</span>;
  }

  const last = room.log.at(-1);

  return (
    <section className="stage" aria-label="Pot">
      <span className="label">{game.phase === 'done' ? 'Paid out' : 'Pot'}</span>
      <Num value={pot} className="pot-amount" />
      <div className="stage-line" key={lineKey}>
        {line}
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
      {game.phase === 'betting' && last && last.kind !== 'hand' && (
        <p className="last-action" key={last.id}>
          {last.text}
        </p>
      )}
    </section>
  );
}
