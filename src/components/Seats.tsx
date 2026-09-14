import { useLayoutEffect, useRef, useState } from 'react';
import { bySeat, type Player } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';

export function seatStatus(p: Player, phase: string, away: boolean, manual: boolean): string | null {
  const inHand = (phase === 'betting' || phase === 'showdown') && p.inHand;
  if (p.leaving) return 'left';
  if (inHand && p.folded) return 'folded';
  if (inHand && p.allIn) return 'all in';
  if (!inHand && (phase === 'betting' || phase === 'showdown')) {
    if (p.stack === 0) return 'busted';
    return p.sittingOut ? 'sitting out' : 'next hand';
  }
  if (p.stack === 0 && phase !== 'lobby') return 'busted';
  if (p.sittingOut) return 'sitting out';
  if (manual) return 'no phone';
  if (away) return 'away';
  return null;
}

export function Seats() {
  const { game, you, member, away } = useTable();
  const hand = game.phase === 'betting' || game.phase === 'showdown';
  const listRef = useRef<HTMLUListElement>(null);
  const [glide, setGlide] = useState<{ top: number; height: number; slide: boolean } | null>(null);
  const seats = bySeat(game);

  const [, remeasure] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => remeasure((n) => n + 1));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-acting]');
    setGlide((prev) => {
      if (!row) return null;
      const top = row.offsetTop;
      const height = row.offsetHeight;
      if (prev && prev.top === top && prev.height === height) return prev;
      return { top, height, slide: prev !== null };
    });
  });

  return (
    <ul ref={listRef} className="seats" aria-label="Players">
      <span
        className="seat-glide"
        aria-hidden="true"
        data-on={glide ? true : undefined}
        data-slide={glide?.slide || undefined}
        style={glide ? { transform: `translateY(${glide.top}px)`, height: glide.height } : undefined}
      />
      {seats.map((p) => {
        const status = seatStatus(p, game.phase, away(p.id), !!member(p.id)?.manual);
        const acting = game.toActId === p.id;
        const blind = hand ? (game.sbId === p.id ? 'SB' : game.bbId === p.id ? 'BB' : null) : null;
        const won = game.phase === 'done' ? game.results.filter((r) => r.id === p.id).reduce((s, r) => s + r.amount, 0) : 0;
        return (
          <li
            key={p.id}
            className="seat"
            data-acting={acting || undefined}
            data-dim={(hand && (!p.inHand || p.folded)) || undefined}
            data-you={p.id === you.id || undefined}
            data-won={won > 0 || undefined}
            aria-current={acting ? 'true' : undefined}
          >
            <span className="seat-mark" aria-hidden="true" />
            <div className="seat-who">
              <span className="seat-name">
                {p.name}
                {hand && game.buttonId === p.id && (
                  <span className="dealer" title="Dealer button">
                    D
                  </span>
                )}
                {p.id === you.id && <span className="seat-you">you</span>}
              </span>
              {(blind || status) && (
                <span className="seat-meta">
                  {[blind, status].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <span className="seat-bet num">
              {hand && p.bet > 0 ? (
                <span className="bet-pop" key={p.bet}>
                  {fmt(p.bet)}
                </span>
              ) : won > 0 ? (
                <span className="won">+{fmt(won)}</span>
              ) : null}
            </span>
            <Num value={p.stack} className="seat-stack" />
          </li>
        );
      })}
    </ul>
  );
}
