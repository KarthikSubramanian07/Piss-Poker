import { useMemo } from 'react';
import { findPlayer, potTotal } from '../../shared/engine';
import { fmt, STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { outcomeLine } from './Stage';

/** Street prompts for the live region — worded apart from the visible deal buttons. */
const NEXT_STREET_ANNOUNCE = ['', 'Flop cards next', 'Turn card next', 'River card next'] as const;

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
          ? `${NEXT_STREET_ANNOUNCE[game.street]}. `
          : '';
      const who = actor.id === you.id ? 'It is your turn to act' : `${actor.name} is to act`;
      const toCall = game.currentBet - actor.bet;
      parts.push(
        `Hand ${game.handNo}, ${street}. ${fresh}${who}${toCall > 0 ? `, ${fmt(toCall)} to call` : ''}. Pot ${fmt(pot)}.`,
      );
    } else if (game.phase === 'showdown') {
      parts.push(
        `Showdown. ${game.runout ? 'Everyone is all in; run the board out.' : 'Cards up.'} Pot ${fmt(pot)}. Pick every winner.`,
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
