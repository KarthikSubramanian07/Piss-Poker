import { exports } from 'cloudflare:workers';
import type { ClientMessage, ServerMessage } from '../../shared/protocol';

type StateMsg = Extract<ServerMessage, { type: 'state' }>;

export const BASE = 'https://piss-poker.pages.dev';

export async function api(path: string, init?: RequestInit) {
  return exports.default.fetch(`${BASE}${path}`, init);
}

let ipCounter = 0;

export async function createRoom(ip = `10.0.0.${++ipCounter}`): Promise<string> {
  const res = await api('/api/rooms', { method: 'POST', headers: { 'cf-connecting-ip': ip } });
  if (res.status !== 201) throw new Error(`create failed ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

export const tokenFor = (n: number) => n.toString(16).padStart(64, '0');

export class Client {
  messages: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: (() => void)[] = [];
  private seq = 0;

  private constructor(public ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      this.messages.push(JSON.parse(e.data as string));
      this.flush();
    });
    ws.addEventListener('close', (e) => {
      this.closed = { code: e.code, reason: e.reason };
      this.flush();
    });
  }

  static async connect(code: string, token?: string) {
    const res = await api(`/api/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
    if (!res.webSocket) throw new Error(`upgrade failed ${res.status}`);
    res.webSocket.accept();
    const client = new Client(res.webSocket);
    if (token) {
      client.send({ type: 'hello', token });
      await client.waitFor((m) => m.type === 'state');
    }
    return client;
  }

  private flush() {
    const ws = this.waiters;
    this.waiters = [];
    ws.forEach((w) => w());
  }

  send(msg: ClientMessage | Record<string, unknown>) {
    this.seq += 1;
    this.ws.send(JSON.stringify({ ...msg, seq: this.seq }));
    return this.seq;
  }

  raw(data: string) {
    this.ws.send(data);
  }

  /** Waits for a message after `from` (index) matching the predicate. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, from?: number): Promise<T>;
  async waitFor(pred: (m: ServerMessage) => boolean, from?: number): Promise<ServerMessage>;
  async waitFor(pred: (m: ServerMessage) => boolean, from = 0): Promise<ServerMessage> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const hit = this.messages.slice(from).find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(this.messages.slice(from).map((m) => m.type))}`);
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  /** Sends a message and resolves with its ok or err reply. */
  async request(msg: ClientMessage | Record<string, unknown>) {
    const from = this.messages.length;
    const seq = this.send(msg);
    const reply = await this.waitFor((m) => (m.type === 'ok' || m.type === 'err') && m.seq === seq, from);
    return reply as Extract<ServerMessage, { type: 'ok' | 'err' }>;
  }

  async ok(msg: ClientMessage | Record<string, unknown>) {
    const reply = await this.request(msg);
    if (reply.type !== 'ok') throw new Error(`expected ok for ${JSON.stringify(msg)}, got ${JSON.stringify(reply)}`);
    return this.state;
  }

  get state(): StateMsg {
    const s = [...this.messages].reverse().find((m): m is StateMsg => m.type === 'state');
    if (!s) throw new Error('no state yet');
    return s;
  }

  async settle() {
    await new Promise((r) => setTimeout(r, 30));
    return this.state;
  }
}

export async function table(names: string[]) {
  const code = await createRoom();
  const clients: Client[] = [];
  for (let i = 0; i < names.length; i++) {
    const c = await Client.connect(code, tokenFor(i + 1));
    await c.ok({ type: 'join', name: names[i] });
    clients.push(c);
  }
  await clients[0].settle();
  const idOf = (c: Client) => c.state.you.id as string;
  return { code, clients, idOf };
}
