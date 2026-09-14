import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { findPlayer, type Game, type Player } from '../../shared/engine';
import type { ClientMessage, MemberView, RoomView, YouView } from '../../shared/protocol';
import { toast } from '../components/Toast';
import { isAway, useNow } from './presence';
import type { RoomConnection, StateMsg } from './useRoom';

export interface TableModel {
  conn: RoomConnection;
  state: StateMsg;
  room: RoomView;
  game: Game;
  you: YouView;
  me: Player | undefined;
  isHost: boolean;
  v: number;
  serverNow: number;
  member: (id: string | null | undefined) => MemberView | undefined;
  away: (id: string | null | undefined) => boolean;
  nameOf: (id: string | null | undefined) => string;
  run: (msg: ClientMessage) => Promise<boolean>;
  busy: boolean;
}

const Ctx = createContext<TableModel | null>(null);

export function TableProvider({ conn, children }: { conn: RoomConnection; children: ReactNode }) {
  const state = conn.state as StateMsg;
  const now = useNow(2000);
  const [inflight, setInflight] = useState(0);
  const { send } = conn;

  const run = useCallback(
    async (msg: ClientMessage) => {
      setInflight((n) => n + 1);
      try {
        const reply = await send(msg);
        if (!reply.ok) toast(reply.code === 'STALE' ? 'The table just changed. Take another look.' : reply.message);
        return reply.ok;
      } finally {
        setInflight((n) => n - 1);
      }
    },
    [send],
  );

  const model = useMemo<TableModel>(() => {
    const { room, you } = state;
    const members = new Map(room.members.map((m) => [m.id, m]));
    const serverNow = now + conn.clockOffset;
    const member = (id: string | null | undefined) => (id ? members.get(id) : undefined);
    return {
      conn,
      state,
      room,
      game: room.game,
      you,
      me: findPlayer(room.game, you.id),
      isHost: you.isHost,
      v: state.v,
      serverNow,
      member,
      away: (id) => isAway(member(id), serverNow),
      nameOf: (id) => member(id)?.name ?? findPlayer(room.game, id)?.name ?? 'Someone',
      run,
      busy: inflight > 0,
    };
  }, [state, now, conn, run, inflight]);

  return <Ctx.Provider value={model}>{children}</Ctx.Provider>;
}

export function useTable() {
  const model = useContext(Ctx);
  if (!model) throw new Error('useTable outside TableProvider');
  return model;
}
