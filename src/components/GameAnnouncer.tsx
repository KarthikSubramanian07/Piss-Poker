import { useMemo } from 'react';
import { findPlayer, potTotal } from '../../shared/engine';
import { fmt, NEXT_CARDS, STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { outcomeLine } from './Stage';

/** Off-screen live region so screen readers hear turns, pot size and outcomes. */
export function GameAnnouncer() {
  const { game, you, nameOf, room } = useTable();

  const message = useMemo(() => {
    const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
    const actor = findPlayer(game, game.toActId);
    const parts: string[] = [];

    if (game.phase === 'lobby') {
      parts.push(`Lobby. ${game.players.length} seated. Pot not open yet.`);
    } else if (game.phase === 'betting' && actor) {
      const street = STREET_NAMES[game.street];
      const fresh =
        game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0
          ? `${NEXT_CARDS[game.street]}. `
          : '';
      const who = actor.id === you.id ? 'Your turn' : `${actor.name} to act`;
      const toCall = game.currentBet - actor.bet;
      parts.push(
        `Hand ${game.handNo}, ${street}. ${fresh}${who}${toCall > 0 ? `, ${fmt(toCall)} to call` : ''}. Pot ${fmt(pot)}.`,
      );
    } else if (game.phase === 'showdown') {
      parts.push(
        `Showdown. ${game.runout ? 'All in. Run it out.' : 'Cards up.'} Pot ${fmt(pot)}. Who won?`,
      );
    } else if (game.phase === 'done') {
      parts.push(`${outcomeLine(game, nameOf)}. Paid out ${fmt(pot)}.`);
    }

    const last = room.log.at(-1);
    if (last && last.kind !== 'hand' && game.phase === 'betting') {
      parts.push(last.text);
    }

    return parts.join(' ');
  }, [game, you.id, nameOf, room.log]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
