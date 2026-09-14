import type { ActionKind, Game, Legal, Settings } from './engine';

export const MAX_MESSAGE_BYTES = 2048;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const PING = 'ping';
export const PONG = 'pong';
/** A socket silent (no ping) for longer than this counts as away. */
export const AWAY_AFTER_MS = 30_000;

export const isRoomCode = (code: unknown): code is string =>
  typeof code === 'string' && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);

export const normalizeCode = (input: string) =>
  input
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, CODE_LENGTH);

export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'join'; name: string }
  | { type: 'addSeat'; name: string }
  | { type: 'claim'; playerId: string }
  | { type: 'cancelClaim' }
  | { type: 'resolveClaim'; claimId: string; allow: boolean }
  | { type: 'start'; v: number }
  | { type: 'act'; v: number; kind: ActionKind; amount?: number; playerId?: string }
  | { type: 'award'; v: number; winners: Record<string, string[]> }
  | { type: 'next'; v: number }
  | { type: 'undo'; v: number }
  | { type: 'sit'; out: boolean; playerId?: string }
  | { type: 'rebuy'; playerId?: string }
  | { type: 'leave' }
  | { type: 'settings'; v: number; settings: Settings }
  | { type: 'setStack'; v: number; playerId: string; stack: number }
  | { type: 'seatOrder'; v: number; ids: string[] }
  | { type: 'kick'; playerId: string }
  | { type: 'transferHost'; playerId: string }
  | { type: 'takeHost' };

export type Envelope = ClientMessage & { seq?: number };

export interface MemberView {
  id: string;
  name: string;
  manual: boolean;
  connections: number;
  lastSeen: number;
}

export interface ClaimView {
  id: string;
  playerId: string;
  at: number;
}

export type LogKind = 'action' | 'hand' | 'win' | 'undo' | 'table';

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
}

export interface RoomView {
  code: string;
  createdAt: number;
  hostId: string | null;
  members: MemberView[];
  game: Game;
  claims: ClaimView[];
  log: LogEntry[];
  undoLabel: string | null;
  turnStartedAt: number | null;
}

export interface YouView {
  id: string | null;
  isHost: boolean;
  claimId: string | null;
  legal: Legal | null;
}

export type ErrorCode = 'STALE' | 'NOT_TURN' | 'INVALID' | 'PHASE' | 'FORBIDDEN' | 'RATE' | 'NOT_FOUND';

export type ServerMessage =
  | { type: 'state'; v: number; serverNow: number; room: RoomView; you: YouView }
  | { type: 'ok'; seq: number }
  | { type: 'err'; seq?: number; code: ErrorCode; message: string }
  | { type: 'closed'; reason: 'expired' | 'kicked' | 'replaced' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{8,32}$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const optId = (v: unknown) => v === undefined || isId(v);
const KINDS: readonly string[] = ['fold', 'check', 'call', 'raise'];

/** Strict structural validation. Unknown message types or malformed fields return null. */
export function parseClientMessage(raw: string): Envelope | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.type !== 'string') return null;
  if (m.seq !== undefined && !isNum(m.seq)) return null;
  const seq = m.seq as number | undefined;
  const v = m.v;
  const out = (msg: ClientMessage): Envelope => (seq === undefined ? msg : { ...msg, seq });
  switch (m.type) {
    case 'hello':
      return typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token) ? out({ type: 'hello', token: m.token }) : null;
    case 'join':
    case 'addSeat':
      return isStr(m.name, 200) ? out({ type: m.type, name: m.name }) : null;
    case 'claim':
      return isId(m.playerId) ? out({ type: 'claim', playerId: m.playerId }) : null;
    case 'cancelClaim':
    case 'leave':
    case 'takeHost':
      return out({ type: m.type });
    case 'resolveClaim':
      return isId(m.claimId) && typeof m.allow === 'boolean'
        ? out({ type: 'resolveClaim', claimId: m.claimId, allow: m.allow })
        : null;
    case 'start':
    case 'next':
    case 'undo':
      return isNum(v) ? out({ type: m.type, v }) : null;
    case 'act': {
      if (!isNum(v) || typeof m.kind !== 'string' || !KINDS.includes(m.kind) || !optId(m.playerId)) return null;
      if (m.amount !== undefined && !isNum(m.amount)) return null;
      if (m.kind === 'raise' && m.amount === undefined) return null;
      const msg: ClientMessage = { type: 'act', v, kind: m.kind as ActionKind };
      if (m.amount !== undefined) msg.amount = m.amount as number;
      if (m.playerId !== undefined) msg.playerId = m.playerId as string;
      return out(msg);
    }
    case 'award': {
      if (!isNum(v) || !isObj(m.winners)) return null;
      const winners: Record<string, string[]> = {};
      const entries = Object.entries(m.winners);
      if (entries.length > 12) return null;
      for (const [potId, ids] of entries) {
        if (!/^\d{1,2}$/.test(potId) || !Array.isArray(ids) || ids.length > 10 || !ids.every(isId)) return null;
        winners[potId] = ids as string[];
      }
      return out({ type: 'award', v, winners });
    }
    case 'sit':
      return typeof m.out === 'boolean' && optId(m.playerId)
        ? out(m.playerId === undefined ? { type: 'sit', out: m.out } : { type: 'sit', out: m.out, playerId: m.playerId as string })
        : null;
    case 'rebuy':
      return optId(m.playerId)
        ? out(m.playerId === undefined ? { type: 'rebuy' } : { type: 'rebuy', playerId: m.playerId as string })
        : null;
    case 'settings': {
      const s = m.settings;
      if (!isNum(v) || !isObj(s)) return null;
      if (![s.sb, s.bb, s.startingStack, s.buyInPrice].every(isNum)) return null;
      return out({
        type: 'settings',
        v,
        settings: {
          sb: s.sb as number,
          bb: s.bb as number,
          startingStack: s.startingStack as number,
          buyInPrice: s.buyInPrice as number,
        },
      });
    }
    case 'setStack':
      return isNum(v) && isId(m.playerId) && isNum(m.stack)
        ? out({ type: 'setStack', v, playerId: m.playerId, stack: m.stack })
        : null;
    case 'seatOrder':
      return isNum(v) && Array.isArray(m.ids) && m.ids.length <= 10 && m.ids.every(isId)
        ? out({ type: 'seatOrder', v, ids: m.ids as string[] })
        : null;
    case 'kick':
    case 'transferHost':
      return isId(m.playerId) ? out({ type: m.type, playerId: m.playerId }) : null;
    default:
      return null;
  }
}
