import { useState, type FormEvent } from 'react';
import { bySeat, handInProgress, LIMITS } from '../../shared/engine';
import { ledger, netsInCents, settleUp } from '../../shared/settle';
import { setSoundEnabled, soundEnabled } from '../lib/device';
import { fmt, money, signed, signedMoney } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';
import { Invite } from './Invite';
import { Sheet } from './Sheet';

export type SheetName = 'menu' | 'invite' | 'settings' | 'players' | 'settle' | null;

interface Props {
  open: SheetName;
  setOpen: (s: SheetName) => void;
  onDisplay: () => void;
  onLeft: () => void;
}

export function Sheets({ open, setOpen, onDisplay, onLeft }: Props) {
  const { room } = useTable();
  const close = () => setOpen(null);
  return (
    <>
      <Sheet open={open === 'menu'} onClose={close} title="Table">
        <Menu setOpen={setOpen} onDisplay={onDisplay} onLeft={onLeft} />
      </Sheet>
      <Sheet open={open === 'invite'} onClose={close} title="Invite players">
        <Invite code={room.code} qrSize={220} />
      </Sheet>
      <Sheet open={open === 'settings'} onClose={close} title="Game settings">
        <SettingsForm onDone={close} />
      </Sheet>
      <Sheet open={open === 'players'} onClose={close} title="Players">
        <Players />
      </Sheet>
      <Sheet open={open === 'settle'} onClose={close} title="Settle up">
        <Settle />
      </Sheet>
    </>
  );
}

function Menu({ setOpen, onDisplay, onLeft }: { setOpen: (s: SheetName) => void; onDisplay: () => void; onLeft: () => void }) {
  const { room, game, me, isHost, run, busy, v, away } = useTable();
  const [sound, setSound] = useState(soundEnabled);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inHand = !!me?.inHand && handInProgress(game);
  const hostAway = !isHost && (!room.hostId || away(room.hostId));

  const item = (label: string, onClick: () => void, opts: { note?: string; danger?: boolean; disabled?: boolean } = {}) => (
    <li>
      <button className="menu-item" data-danger={opts.danger || undefined} onClick={onClick} disabled={opts.disabled || busy}>
        <span>{label}</span>
        {opts.note && <span className="menu-note">{opts.note}</span>}
      </button>
    </li>
  );

  return (
    <div className="menu">
      <ul className="menu-group">
        {room.undoLabel && item('Undo', () => run({ type: 'undo', v }).then((ok) => ok && setOpen(null)), { note: room.undoLabel })}
        {item('Invite players', () => setOpen('invite'), { note: room.code })}
        {item('Settle up', () => setOpen('settle'))}
        {item('Table display', onDisplay, { note: 'Big screen view' })}
      </ul>

      {me && (
        <ul className="menu-group">
          {item(me.sittingOut ? 'Sit back in' : 'Sit out', () => run({ type: 'sit', out: !me.sittingOut }), {
            note: inHand ? 'From the next hand' : undefined,
          })}
          {me.stack === 0 &&
            item(`Rebuy ${fmt(game.settings.startingStack)}`, () => run({ type: 'rebuy' }), {
              disabled: inHand,
              note: inHand ? 'After this hand' : undefined,
            })}
          {item('Sound on your turn', () => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }, { note: sound ? 'On' : 'Off' })}
        </ul>
      )}

      {(isHost || hostAway) && (
        <ul className="menu-group">
          {isHost && item('Game settings', () => setOpen('settings'))}
          {isHost && item('Players and stacks', () => setOpen('players'))}
          {hostAway && item('Take over hosting', () => run({ type: 'takeHost' }))}
        </ul>
      )}

      {me && (
        <ul className="menu-group">
          {confirmLeave ? (
            <li className="confirm-row">
              <span>{inHand ? 'You will fold this hand.' : 'Leave the table?'}</span>
              <button className="btn btn-quiet btn-sm" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={async () => {
                  if (await run({ type: 'leave' })) onLeft();
                }}
              >
                Leave
              </button>
            </li>
          ) : (
            item('Leave table', () => setConfirmLeave(true), { danger: true })
          )}
        </ul>
      )}
    </div>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { game, run, busy, v } = useTable();
  const current = game.pendingSettings ?? game.settings;
  const [sb, setSb] = useState(String(current.sb));
  const [bb, setBb] = useState(String(current.bb));
  const [stack, setStack] = useState(String(current.startingStack));
  const [price, setPrice] = useState(current.buyInPrice ? (current.buyInPrice / 100).toFixed(2) : '');

  const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const sbN = n(sb);
  const bbN = n(bb);
  const stackN = n(stack);
  const priceCents = price.trim() === '' ? 0 : Math.round(Number(price) * 100);
  const error =
    !Number.isSafeInteger(bbN) || bbN < 1 || bbN > LIMITS.maxBlind
      ? 'Big blind must be a whole number of at least 1'
      : !Number.isSafeInteger(sbN) || sbN < 0 || sbN > bbN
        ? 'Small blind must be between 0 and the big blind'
        : !Number.isSafeInteger(stackN) || stackN < bbN || stackN > LIMITS.maxStack
          ? 'Starting stack must be at least one big blind'
          : !Number.isFinite(priceCents) || priceCents < 0 || priceCents > LIMITS.maxPrice
            ? 'Buy-in price looks off'
            : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    const ok = await run({
      type: 'settings',
      v,
      settings: { sb: sbN, bb: bbN, startingStack: stackN, buyInPrice: priceCents },
    });
    if (ok) onDone();
  };

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="field-row">
        <NumberField id="sb" label="Small blind" value={sb} onChange={setSb} />
        <NumberField id="bb" label="Big blind" value={bb} onChange={setBb} />
      </div>
      <NumberField id="stack" label="Starting stack" value={stack} onChange={setStack} hint="Also the rebuy amount" />
      <NumberField
        id="price"
        label="Cash per buy-in"
        value={price}
        onChange={setPrice}
        decimal
        placeholder="Optional, e.g. 20"
        hint="Turns chip results into who pays whom"
      />
      {handInProgress(game) && <p className="hint">Changes apply from the next hand.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-xl btn-block" disabled={!!error || busy}>
        Save
      </button>
    </form>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (s: string) => void;
  hint?: string;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id} className="field-label">
        {props.label}
      </label>
      <input
        id={props.id}
        className="text-input num"
        inputMode={props.decimal ? 'decimal' : 'numeric'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value.replace(props.decimal ? /[^\d.]/g : /\D/g, ''))}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

function Players() {
  const { game, room, run, busy, v, member } = useTable();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [stack, setStack] = useState('');
  const hand = handInProgress(game);

  const addSeat = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && (await run({ type: 'addSeat', name: name.trim() }))) setName('');
  };

  return (
    <div className="players">
      <ul className="player-rows">
        {bySeat(game).map((p) => {
          const m = member(p.id);
          const locked = hand && p.inHand;
          return (
            <li key={p.id} className="player-row">
              <div className="player-line">
                <span className="lobby-name">
                  {p.name}
                  {room.hostId === p.id && <span className="tag">host</span>}
                  {m?.manual && <span className="tag">no phone</span>}
                </span>
                <span className="num">{fmt(p.stack)}</span>
              </div>
              {editing === p.id ? (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const value = Number(stack);
                    if (!Number.isSafeInteger(value) || value < 0) return;
                    if (await run({ type: 'setStack', v, playerId: p.id, stack: value })) setEditing(null);
                  }}
                >
                  <input
                    className="text-input num"
                    inputMode="numeric"
                    value={stack}
                    autoFocus
                    aria-label={`New stack for ${p.name}`}
                    onChange={(e) => setStack(e.target.value.replace(/\D/g, ''))}
                  />
                  <button className="btn btn-primary btn-sm" disabled={busy || stack === ''}>
                    Set
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="player-actions">
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy || locked}
                    title={locked ? 'After this hand' : undefined}
                    onClick={() => {
                      setEditing(p.id);
                      setStack(String(p.stack));
                    }}
                  >
                    Set stack
                  </button>
                  <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'sit', out: !p.sittingOut, playerId: p.id })}>
                    {p.sittingOut ? 'Sit in' : 'Sit out'}
                  </button>
                  {m && !m.manual && room.hostId !== p.id && (
                    <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'transferHost', playerId: p.id })}>
                      Make host
                    </button>
                  )}
                  {room.hostId !== p.id && (
                    <button className="btn btn-danger-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'kick', playerId: p.id })}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hand && <p className="hint">Stacks of players in the current hand can be changed once it ends.</p>}
      <form className="inline-form add-seat" onSubmit={addSeat}>
        <label htmlFor="seat-name" className="field-label">
          Add someone without a phone
        </label>
        <div className="join-row">
          <input
            id="seat-name"
            className="text-input"
            value={name}
            maxLength={24}
            placeholder="Name"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-quiet btn-lg" disabled={busy || !name.trim()}>
            <Icon name="plus" size={18} /> Add
          </button>
        </div>
        <span className="hint">Anyone at the table can act for them.</span>
      </form>
    </div>
  );
}

function Settle() {
  const { game, nameOf } = useTable();
  const rows = ledger(game);
  const price = game.settings.buyInPrice;
  const cents = netsInCents(rows, price, game.settings.startingStack);
  const useCash = price > 0;
  const transfers = settleUp(rows.map((r) => ({ id: r.id, net: useCash ? (cents.get(r.id) ?? 0) : r.net })));
  const name = (id: string) => rows.find((r) => r.id === id)?.name ?? nameOf(id);

  if (rows.length === 0) return <p className="muted">Nobody has played yet.</p>;

  return (
    <div className="settle">
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col" className="num">
              In
            </th>
            <th scope="col" className="num">
              Now
            </th>
            <th scope="col" className="num">
              Net
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-sign={Math.sign(r.net)}>
              <th scope="row">
                {r.name}
                {r.departed && <span className="tag">left</span>}
              </th>
              <td className="num">{fmt(r.buyIn)}</td>
              <td className="num">{fmt(r.stack)}</td>
              <td className="num net">{useCash ? signedMoney(cents.get(r.id) ?? 0) : signed(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="settle-title">{transfers.length ? 'To square up' : 'Everyone is even'}</h3>
      {transfers.length > 0 && (
        <ul className="transfers">
          {transfers.map((t, i) => (
            <li key={i}>
              <span>
                <strong>{name(t.from)}</strong> pays <strong>{name(t.to)}</strong>
              </span>
              <span className="num">{useCash ? money(t.amount) : `${fmt(t.amount)} chips`}</span>
            </li>
          ))}
        </ul>
      )}
      {!useCash && <p className="hint">Set a cash price per buy-in in game settings to see money amounts.</p>}
      {handInProgress(game) && <p className="hint">Chips in the current pot are counted for whoever put them in.</p>}
    </div>
  );
}
