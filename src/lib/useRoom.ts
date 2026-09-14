import { useCallback, useEffect, useRef, useState } from 'react';
import { PING, PONG, type ClientMessage, type ServerMessage } from '../../shared/protocol';
import { roomInfo } from './api';
import { deviceToken } from './device';

export type StateMsg = Extract<ServerMessage, { type: 'state' }>;
export type Status = 'connecting' | 'open' | 'reconnecting' | 'missing' | 'closed';
export type ClosedReason = 'expired' | 'kicked' | 'replaced';
export type Reply = { ok: true } | { ok: false; code: string; message: string };

const PING_EVERY = 10_000;
const SILENCE_LIMIT = 25_000;
const REQUEST_TIMEOUT = 8_000;

export interface RoomConnection {
  status: Status;
  state: StateMsg | null;
  closedReason: ClosedReason | null;
  clockOffset: number;
  send: (msg: ClientMessage) => Promise<Reply>;
  reconnect: () => void;
}

export function useRoom(code: string): RoomConnection {
  const [status, setStatus] = useState<Status>('connecting');
  const [state, setState] = useState<StateMsg | null>(null);
  const [closedReason, setClosedReason] = useState<ClosedReason | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);
  const pending = useRef(new Map<number, { resolve: (r: Reply) => void; timer: number }>());
  const lastRx = useRef(Date.now());
  const attempt = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const stopped = useRef(false);

  const failPending = useCallback((message: string) => {
    for (const [, p] of pending.current) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, code: 'OFFLINE', message });
    }
    pending.current.clear();
  }, []);

  const connect = useCallback(() => {
    if (stopped.current) return;
    clearTimeout(retryTimer.current);
    const old = wsRef.current;
    if (old) {
      old.onclose = null;
      old.onmessage = null;
      old.close();
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`);
    wsRef.current = ws;
    lastRx.current = Date.now();

    ws.onopen = () => {
      attempt.current = 0;
      lastRx.current = Date.now();
      ws.send(JSON.stringify({ type: 'hello', token: deviceToken() }));
    };

    ws.onmessage = (event) => {
      lastRx.current = Date.now();
      if (event.data === PONG) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'state') {
        setState(msg);
        setStatus('open');
        setClockOffset(msg.serverNow - Date.now());
      } else if (msg.type === 'ok' || msg.type === 'err') {
        const seq = msg.seq;
        const p = seq === undefined ? undefined : pending.current.get(seq);
        if (p && seq !== undefined) {
          clearTimeout(p.timer);
          pending.current.delete(seq);
          p.resolve(msg.type === 'ok' ? { ok: true } : { ok: false, code: msg.code, message: msg.message });
        } else if (msg.type === 'err') {
          window.dispatchEvent(new CustomEvent('pp:error', { detail: msg.message }));
        }
      } else if (msg.type === 'closed') {
        stopped.current = true;
        setClosedReason(msg.reason);
        setStatus('closed');
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      failPending('Connection lost');
      if (stopped.current) return;
      setStatus('reconnecting');
      attempt.current += 1;
      const base = Math.min(10_000, 500 * 2 ** Math.min(attempt.current, 5));
      const delay = base * (0.7 + Math.random() * 0.6);
      retryTimer.current = window.setTimeout(async () => {
        if (attempt.current >= 3) {
          const info = await roomInfo(code).catch(() => undefined);
          if (info === null) {
            stopped.current = true;
            setStatus('missing');
            return;
          }
        }
        connect();
      }, delay);
    };
  }, [code, failPending]);

  const reconnect = useCallback(() => {
    if (stopped.current) return;
    attempt.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    stopped.current = false;
    let cancelled = false;
    roomInfo(code)
      .then((info) => {
        if (cancelled) return;
        if (info === null) {
          stopped.current = true;
          setStatus('missing');
        } else connect();
      })
      .catch(() => !cancelled && connect());

    const heartbeat = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || stopped.current) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(PING);
        if (Date.now() - lastRx.current > SILENCE_LIMIT) connect();
      }
    }, PING_EVERY);

    const wake = () => {
      if (document.visibilityState === 'hidden' || stopped.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || Date.now() - lastRx.current > 15_000) reconnect();
      else ws.send(PING);
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('focus', wake);

    return () => {
      cancelled = true;
      stopped.current = true;
      clearInterval(heartbeat);
      clearTimeout(retryTimer.current);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
      window.removeEventListener('focus', wake);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      failPending('Left the table');
    };
  }, [code, connect, reconnect, failPending]);

  const send = useCallback(
    (msg: ClientMessage) =>
      new Promise<Reply>((resolve) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          resolve({ ok: false, code: 'OFFLINE', message: 'Reconnecting. Try again in a second.' });
          return;
        }
        seqRef.current += 1;
        const seq = seqRef.current;
        const timer = window.setTimeout(() => {
          pending.current.delete(seq);
          resolve({ ok: false, code: 'OFFLINE', message: 'No response. Reconnecting.' });
          reconnect();
        }, REQUEST_TIMEOUT);
        pending.current.set(seq, { resolve, timer });
        ws.send(JSON.stringify({ ...msg, seq }));
      }),
    [reconnect],
  );

  return { status, state, closedReason, clockOffset, send, reconnect };
}
