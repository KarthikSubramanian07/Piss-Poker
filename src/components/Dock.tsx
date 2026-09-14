import { useEffect, useMemo, useRef, useState } from 'react';
import {
  eligibleForHand,
  findPlayer,
  legalActions,
  potTotal,
  type ActionKind,
  type Legal,
  type Player,
} from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { useShake } from '../lib/motion';
import { Icon } from './Icon';
import { Num } from './Num';

const ACT_FOR_AFTER_MS = 15_000;

export function Dock() {
  const shaking = useShake();
  return (
    <div className="dock-shake" data-shake={shaking || undefined}>
      <DockBody />
    </div>
  );
}

function DockBody() {
  const { game, you, me, room, serverNow, away, member } = useTable();
  const [actingFor, setActingFor] = useState<string | null>(null);

  const actorId = game.toActId;
  useEffect(() => setActingFor(null), [actorId, game.phase]);

  if (game.phase === 'lobby') return <LobbyDock />;
  if (game.phase === 'showdown') return <AwardPanel />;
  if (game.phase === 'done') return <ResultsPanel />;

  if (you.legal && me) return <ActionPanel legal={you.legal} player={me} />;

  const actor = findPlayer(game, actorId);
  const actorMember = member(actorId);
  const waited = room.turnStartedAt ? serverNow - room.turnStartedAt : 0;
  const canActFor = !!actor && !!me && (actorMember?.manual || (away(actorId) && waited >= ACT_FOR_AFTER_MS));

  if (actingFor && actor && actingFor === actor.id) {
    const legal = legalActions(game, actor.id);
    if (legal) {
      return <ActionPanel legal={legal} player={actor} actingFor onCancel={() => setActingFor(null)} />;
    }
  }

  return (
    <div className="dock">
      <MyStatus />
      {canActFor && actor && (
        <button className="btn btn-quiet btn-lg btn-block" onClick={() => setActingFor(actor.id)}>
          Act for {actor.name}
        </button>
      )}
    </div>
  );
}

function MyStatus() {
  const { game, me, run, busy } = useTable();
  if (!me) return null;
  const inHand = me.inHand && (game.phase === 'betting' || game.phase === 'showdown');
  let note: string;
  if (!inHand) note = me.stack === 0 ? 'Busted' : me.sittingOut ? 'Sitting out' : 'In from the next hand';
  else if (me.folded) note = 'Folded';
  else if (me.allIn) note = 'All in';
  else note = me.committed > 0 ? `${fmt(me.committed)} in the pot` : 'In the hand';
  const canRebuy = me.stack === 0 && !inHand;
  return (
    <div className="my-status">
      <div>
        <span className="label">Your stack</span>
        <Num value={me.stack} className="my-stack" />
      </div>
      <div className="my-note">
        <span>{note}</span>
        {canRebuy && (
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'rebuy' })}>
            Rebuy {fmt(game.settings.startingStack)}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- your turn ----------------

interface ActionProps {
  legal: Legal;
  player: Player;
  actingFor?: boolean;
  onCancel?: () => void;
}

function ActionPanel({ legal, player, actingFor, onCancel }: ActionProps) {
  const { game, run, busy, v } = useTable();
  const [raising, setRaising] = useState(false);
  const pot = potTotal(game);
  const openLabel = game.currentBet === 0 ? 'Bet' : 'Raise';

  const act = (kind: ActionKind, amount?: number) =>
    run({ type: 'act', v, kind, ...(amount !== undefined ? { amount } : {}), ...(actingFor ? { playerId: player.id } : {}) });

  useEffect(() => setRaising(false), [v]);

  useEffect(() => {
    if (raising) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && legal.canFold) void act('fold');
      else if (k === 'c') void act(legal.canCheck ? 'check' : 'call');
      else if (k === 'r' && legal.canRaise) setRaising(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (raising && legal.canRaise) {
    return (
      <RaisePanel
        legal={legal}
        pot={pot}
        currentBet={game.currentBet}
        bb={game.settings.bb}
        label={openLabel}
        busy={busy}
        onBack={() => setRaising(false)}
        onConfirm={(amount) => act('raise', amount)}
      />
    );
  }

  const callText = legal.callIsAllIn ? `All in ${fmt(legal.callAmount)}` : `Call ${fmt(legal.callAmount)}`;
  const buttons = [
    legal.canFold && { key: 'fold', label: 'Fold', hint: 'F', cls: 'btn-turn-quiet', onClick: () => act('fold') },
    legal.canCheck
      ? { key: 'check', label: 'Check', hint: 'C', cls: 'btn-turn-main', onClick: () => act('check') }
      : { key: 'call', label: callText, hint: 'C', cls: 'btn-turn-main', onClick: () => act('call') },
    legal.canRaise && { key: 'raise', label: openLabel, hint: 'R', cls: 'btn-turn-quiet', onClick: () => setRaising(true) },
  ].filter(Boolean) as { key: string; label: string; hint: string; cls: string; onClick: () => void }[];

  return (
    <div className="dock dock-turn" data-acting-for={actingFor || undefined}>
      <div className="turn-head">
        <div>
          <span className="turn-title">{actingFor ? `Acting for ${player.name}` : 'Your turn'}</span>
          <span className="turn-sub">Stack {fmt(player.stack)}</span>
        </div>
        {actingFor && (
          <button className="icon-btn" onClick={onCancel} aria-label="Stop acting for this player">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="turn-buttons" data-count={buttons.length}>
        {buttons.map((b) => (
          <button key={b.key} className={`btn btn-turn ${b.cls}`} onClick={b.onClick} disabled={busy}>
            {b.label}
            <kbd className="kbd">{b.hint}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}

interface RaiseProps {
  legal: Legal;
  pot: number;
  currentBet: number;
  bb: number;
  label: string;
  busy: boolean;
  onBack: () => void;
  onConfirm: (amount: number) => void;
}

function RaisePanel({ legal, pot, currentBet, bb, label, busy, onBack, onConfirm }: RaiseProps) {
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  const [amount, setAmount] = useState(min);
  const [text, setText] = useState(String(min));
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const set = (n: number) => {
    const c = clamp(n);
    setAmount(c);
    setText(String(c));
  };

  const presets = useMemo(() => {
    const potAfterCall = pot + legal.toCall;
    const opening = currentBet === 0;
    const half = opening ? pot / 2 : currentBet + potAfterCall / 2;
    const full = opening ? pot : currentBet + potAfterCall;
    return [
      { label: 'Min', value: min },
      { label: '½ pot', value: clamp(half) },
      { label: 'Pot', value: clamp(full) },
      { label: 'All in', value: max },
    ];
  }, [pot, legal.toCall, currentBet, min, max]);

  const typed = Number(text);
  const valid = Number.isSafeInteger(typed) && typed <= max && (typed >= min || typed === max);
  const final = valid ? typed : amount;
  const allIn = final === max;
  const confirm = () => {
    if (valid && !busy) onConfirm(final);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'ArrowUp' && e.target !== inputRef.current) set(final + bb);
      else if (e.key === 'ArrowDown' && e.target !== inputRef.current) set(final - bb);
      else if (e.key.toLowerCase() === 'a' && e.target !== inputRef.current) set(max);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="dock dock-turn dock-raise">
      <div className="raise-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <label className="raise-amount">
          <span className="turn-sub">{label === 'Bet' ? 'Bet' : 'Raise to'}</span>
          <input
            ref={inputRef}
            className="raise-input num"
            inputMode="numeric"
            pattern="[0-9]*"
            value={text}
            aria-invalid={!valid}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              setText(digits);
              const n = Number(digits);
              if (digits && n >= min && n <= max) setAmount(n);
            }}
            onBlur={() => set(Number(text) || min)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="stepper">
          <button className="icon-btn" onClick={() => set(final - bb)} disabled={final <= min} aria-label={`Minus ${bb}`}>
            <Icon name="minus" />
          </button>
          <button className="icon-btn" onClick={() => set(final + bb)} disabled={final >= max} aria-label={`Plus ${bb}`}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={1}
        value={final}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Amount"
        style={{ ['--fill' as string]: `${max === min ? 100 : ((final - min) / (max - min)) * 100}%` }}
      />

      <div className="presets">
        {presets.map((p) => (
          <button key={p.label} className="preset" data-on={final === p.value || undefined} onClick={() => set(p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      <button className="btn btn-turn btn-turn-main btn-block" onClick={confirm} disabled={!valid || busy}>
        {allIn ? `All in ${fmt(max)}` : `${label === 'Bet' ? 'Bet' : 'Raise to'} ${fmt(final)}`}
      </button>
    </div>
  );
}

// ---------------- showdown ----------------

function AwardPanel() {
  const { game, run, busy, v, nameOf } = useTable();
  const open = game.pots.filter((p) => !p.paid);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [touched, setTouched] = useState<Record<number, boolean>>({});

  const toggle = (potId: number, id: string) => {
    const index = open.findIndex((p) => p.id === potId);
    const current = picks[potId] ?? [];
    const nextPick = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const next = { ...picks, [potId]: nextPick };
    // Whoever wins a pot usually has the best hand among everyone in later side pots too.
    open.slice(index + 1).forEach((later) => {
      if (touched[later.id]) return;
      next[later.id] = nextPick.filter((x) => later.eligible.includes(x));
    });
    setPicks(next);
    setTouched({ ...touched, [potId]: true });
  };

  const complete = open.every((p) => (picks[p.id] ?? []).length > 0);
  const potName = (i: number) => (open.length === 1 ? 'Pot' : i === 0 ? 'Main pot' : `Side pot ${i}`);

  return (
    <div className="dock dock-award">
      <div className="turn-head">
        <div>
          <span className="turn-title">Who won?</span>
          <span className="turn-sub">
            {game.runout ? 'Deal out the rest of the board first. ' : ''}Tap more than one name to split.
          </span>
        </div>
      </div>
      <div className="pots">
        {open.map((pot, i) => (
          <fieldset key={pot.id} className="pot-pick">
            <legend>
              <span>{potName(i)}</span>
              <span className="num">{fmt(pot.amount)}</span>
            </legend>
            <div className="chip-list">
              {pot.eligible.map((id) => {
                const on = (picks[pot.id] ?? []).includes(id);
                return (
                  <button key={id} className="chip chip-lg" aria-pressed={on} onClick={() => toggle(pot.id, id)}>
                    {on && <Icon name="check" size={16} />}
                    {nameOf(id)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <button
        className="btn btn-primary btn-xl btn-block"
        disabled={!complete || busy}
        onClick={() => run({ type: 'award', v, winners: Object.fromEntries(open.map((p) => [p.id, picks[p.id]])) })}
      >
        {complete ? 'Pay out' : 'Pick a winner'}
      </button>
    </div>
  );
}

// ---------------- hand over ----------------

function ResultsPanel() {
  const { game, run, busy, v, room, me } = useTable();
  const ready = game.players.filter(eligibleForHand).length >= 2;
  const iAmOut = me && me.stack === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, dialog[open]')) return;
      if (e.key.toLowerCase() === 'n' && ready && !busy) {
        e.preventDefault();
        void run({ type: 'next', v });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="dock dock-done">
      {iAmOut && (
        <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'rebuy' })}>
          Rebuy for {fmt(game.settings.startingStack)}
        </button>
      )}
      <div className="done-actions">
        {room.undoLabel && (
          <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => run({ type: 'undo', v })} aria-label="Undo payout">
            <Icon name="undo" />
          </button>
        )}
        <button className="btn btn-primary btn-xl grow" disabled={!ready || busy} onClick={() => run({ type: 'next', v })}>
          {ready ? 'Deal next hand' : 'Needs two players with chips'}
          {ready && <kbd className="kbd">N</kbd>}
        </button>
      </div>
    </div>
  );
}

// ---------------- lobby ----------------

function LobbyDock() {
  const { game, isHost, room, run, busy, v, nameOf, away } = useTable();
  const ready = game.players.filter(eligibleForHand).length >= 2;
  if (!isHost) {
    const hostAway = !room.hostId || away(room.hostId);
    return (
      <div className="dock">
        <p className="dock-wait">
          {room.hostId ? `Waiting for ${nameOf(room.hostId)} to deal the first hand` : 'Waiting for a host'}
        </p>
        {hostAway && (
          <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'takeHost' })}>
            Take over hosting
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dock">
      <button className="btn btn-primary btn-xl btn-block" disabled={!ready || busy} onClick={() => run({ type: 'start', v })}>
        {ready ? 'Deal the first hand' : 'Needs one more player'}
      </button>
    </div>
  );
}
