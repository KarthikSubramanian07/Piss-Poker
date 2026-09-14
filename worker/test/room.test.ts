import { env } from 'cloudflare:workers';
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { originAllowed, randomCode } from '../src/index';
import { api, Client, createRoom, table, tokenFor } from './client';

describe('http api', () => {
  it('reports health and creates rooms with valid codes', async () => {
    expect((await api('/api/health')).status).toBe(200);
    const code = await createRoom();
    expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);
    const info = await api(`/api/rooms/${code}`);
    expect(await info.json()).toEqual({ code, phase: 'lobby', players: [] });
  });

  it('returns 404 for unknown or malformed rooms without creating them', async () => {
    expect((await api('/api/rooms/ZZZZ')).status).toBe(404);
    expect((await api('/api/rooms/zz1')).status).toBe(404);
    const ws = await api('/api/rooms/ZZZZ/ws', { headers: { Upgrade: 'websocket' } });
    expect(ws.status).toBe(404);
    const stub = env.ROOMS.get(env.ROOMS.idFromName('ZZZZ'));
    const keys = await runInDurableObject(stub, (_, state) => state.storage.list());
    expect(keys.size).toBe(0);
  });

  it('rejects foreign origins and non websocket upgrades', async () => {
    const code = await createRoom();
    const res = await api(`/api/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect((await api(`/api/rooms/${code}/ws`)).status).toBe(426);
    expect(originAllowed('https://piss-poker.pages.dev', {} as never)).toBe(true);
    expect(originAllowed('https://feat-x.piss-poker.pages.dev', {} as never)).toBe(true);
    expect(originAllowed('http://localhost:5173', {} as never)).toBe(true);
    expect(originAllowed('https://piss-poker.pages.dev.evil.com', {} as never)).toBe(false);
    expect(originAllowed('http://piss-poker.pages.dev', {} as never)).toBe(false);
  });

  it('rate limits table creation per address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await api('/api/rooms', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(randomCode()).toMatch(/^[A-HJKMNP-Z]{4}$/);
  });
});

describe('joining', () => {
  it('first player hosts, names must be unique, and reconnecting keeps the seat', async () => {
    const { code, clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    expect(ana.state.room.hostId).toBe(idOf(ana));
    expect(ana.state.you.isHost).toBe(true);
    expect(ben.state.you.isHost).toBe(false);
    expect(ana.state.room.members.map((m) => m.name)).toEqual(['Ana', 'Ben']);

    const dup = await Client.connect(code, tokenFor(99));
    const reply = await dup.request({ type: 'join', name: ' ana ' });
    expect(reply).toMatchObject({ type: 'err', code: 'INVALID' });

    const again = await Client.connect(code, tokenFor(2));
    expect(again.state.you.id).toBe(idOf(ben));
    const info = await (await api(`/api/rooms/${code}`)).json();
    expect(info).toMatchObject({ players: ['Ana', 'Ben'] });
  });

  it('requires hello before anything else and rejects malformed or oversized messages', async () => {
    const code = await createRoom();
    const c = await Client.connect(code);
    expect(await c.request({ type: 'join', name: 'X' })).toMatchObject({ code: 'FORBIDDEN' });
    c.raw('{nope');
    await c.waitFor((m) => m.type === 'err' && m.code === 'INVALID');
    c.raw(JSON.stringify({ type: 'join', name: 'x'.repeat(3000) }));
    await c.waitFor(() => c.closed !== null);
    expect(c.closed?.code).toBe(1009);
  });

  it('rate limits floods', async () => {
    const code = await createRoom();
    const c = await Client.connect(code, tokenFor(7));
    for (let i = 0; i < 60; i++) c.send({ type: 'cancelClaim' });
    await c.waitFor((m) => m.type === 'err' && m.code === 'RATE');
  });
});

describe('playing a hand', () => {
  it('runs a full hand with turn enforcement, stale protection and awards', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben', 'Cat']);
    const [ana, ben, cat] = clients;
    const v0 = ana.state.v;

    expect(await ben.request({ type: 'start', v: v0 })).toMatchObject({ code: 'FORBIDDEN' });
    await ana.ok({ type: 'start', v: v0 });
    let s = await cat.settle();
    expect(s.room.game.phase).toBe('betting');
    expect(s.room.game.toActId).toBe(idOf(ana));
    expect(ana.state.you.legal).toMatchObject({ toCall: 10, canRaise: true, minRaiseTo: 20 });
    expect(ben.state.you.legal).toBeNull();

    expect(await ben.request({ type: 'act', v: s.v, kind: 'call' })).toMatchObject({ code: 'NOT_TURN' });
    const stale = await ana.request({ type: 'act', v: s.v - 1, kind: 'call' });
    expect(stale).toMatchObject({ code: 'STALE' });

    await ana.ok({ type: 'act', v: ana.state.v, kind: 'raise', amount: 40 });
    await ben.ok({ type: 'act', v: ben.state.v, kind: 'call' });
    await cat.ok({ type: 'act', v: cat.state.v, kind: 'call' });
    s = await ana.settle();
    expect(s.room.game.street).toBe(1);
    expect(s.room.log.map((l) => l.text)).toEqual(
      expect.arrayContaining(['Ana raises to 40', 'Ben calls 35', 'Cat calls 30', 'Flop']),
    );

    for (let street = 1; street <= 3; street++) {
      for (let i = 0; i < 3; i++) {
        const turn = ana.state.room.game.toActId;
        const c = clients.find((x) => idOf(x) === turn)!;
        await c.ok({ type: 'act', v: c.state.v, kind: 'check' });
      }
    }
    s = await ana.settle();
    expect(s.room.game.phase).toBe('showdown');
    const pot = s.room.game.pots.find((p) => !p.paid)!;
    expect(pot.amount).toBe(120);

    const bad = await ben.request({ type: 'award', v: s.v, winners: { [pot.id]: ['0000000000000000'] } });
    expect(bad).toMatchObject({ code: 'INVALID' });
    await ben.ok({ type: 'award', v: s.v, winners: { [pot.id]: [idOf(cat)] } });
    s = await ana.settle();
    expect(s.room.game.phase).toBe('done');
    expect(s.room.game.players.find((p) => p.id === idOf(cat))?.stack).toBe(1080);
    expect(s.room.log.at(-1)?.text).toBe('Cat wins 120');

    const vDone = s.v;
    const [first, second] = await Promise.all([
      ben.request({ type: 'next', v: vDone }),
      cat.request({ type: 'next', v: vDone }),
    ]);
    expect([first.type, second.type].sort()).toEqual(['err', 'ok']);
    s = await ana.settle();
    expect(s.room.game.handNo).toBe(2);
  });

  it('undo restores the previous game state, and a double undo only steps back once', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.ok({ type: 'act', v: ana.state.v, kind: 'raise', amount: 100 });
    let s = await ben.settle();
    expect(s.room.undoLabel).toBe('Ana raises to 100');
    const v = s.v;
    const [a, b] = await Promise.all([ben.request({ type: 'undo', v }), ana.request({ type: 'undo', v })]);
    expect([a.type, b.type].sort()).toEqual(['err', 'ok']);
    s = await ana.settle();
    expect(s.room.game.toActId).toBe(idOf(ana));
    expect(s.room.game.currentBet).toBe(10);
    expect(s.room.log.at(-1)?.text).toMatch(/undid: Ana raises to 100/);
  });

  it('undo never removes someone who joined afterwards', async () => {
    const { code, clients } = await table(['Ana', 'Ben']);
    const [ana] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    const late = await Client.connect(code, tokenFor(50));
    await late.ok({ type: 'join', name: 'Late' });
    await ana.ok({ type: 'undo', v: ana.state.v });
    const s = await late.settle();
    expect(s.room.game.phase).toBe('lobby');
    expect(s.room.game.players.map((p) => p.name)).toEqual(['Ana', 'Ben', 'Late']);
    expect(s.you.id).not.toBeNull();
  });

  it('host settings and stack edits are host only and queue during a hand', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    const settings = { sb: 25, bb: 50, startingStack: 5000, buyInPrice: 2000 };
    expect(await ben.request({ type: 'settings', v: ben.state.v, settings })).toMatchObject({ code: 'FORBIDDEN' });
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.ok({ type: 'settings', v: ana.state.v, settings });
    let s = await ben.settle();
    expect(s.room.game.pendingSettings).toEqual(settings);
    expect(await ana.request({ type: 'setStack', v: s.v, playerId: idOf(ben), stack: 1 })).toMatchObject({
      code: 'PHASE',
    });
    await ana.ok({ type: 'act', v: ana.state.v, kind: 'fold' });
    await ana.ok({ type: 'setStack', v: ana.state.v, playerId: idOf(ben), stack: 3000 });
    await ben.ok({ type: 'next', v: ben.state.v });
    s = await ana.settle();
    expect(s.room.game.settings).toEqual(settings);
    expect(s.room.game.currentBet).toBe(50);
  });
});

describe('seats and devices', () => {
  it('acting for someone is only allowed when they are away or have no phone', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    await ana.ok({ type: 'addSeat', name: 'Dee' });
    let s = await ben.settle();
    const dee = s.room.members.find((m) => m.name === 'Dee')!;
    expect(dee.manual).toBe(true);

    await ana.ok({ type: 'start', v: ana.state.v });
    s = await ben.settle();
    const turn = s.room.game.toActId!;
    if (turn === idOf(ana)) {
      expect(await ben.request({ type: 'act', v: s.v, kind: 'call', playerId: idOf(ana) })).toMatchObject({
        code: 'FORBIDDEN',
      });
    }
    // Play until it is Dee's turn, then anyone may act for Dee.
    for (let i = 0; i < 6 && ben.state.room.game.toActId !== dee.id; i++) {
      const t = ben.state.room.game.toActId!;
      const c = clients.find((x) => idOf(x) === t)!;
      const legal = c.state.you.legal!;
      await c.ok({ type: 'act', v: c.state.v, kind: legal.canCheck ? 'check' : 'call' });
    }
    expect(ben.state.room.game.toActId).toBe(dee.id);
    const game = ben.state.room.game;
    const deeSeat = game.players.find((p) => p.id === dee.id)!;
    const kind = game.currentBet > deeSeat.bet ? 'call' : 'check';
    await ben.ok({ type: 'act', v: ben.state.v, kind, playerId: dee.id });
    s = await ana.settle();
    expect(s.room.log.some((l) => l.text.startsWith('Dee ') && l.text.endsWith('(by Ben)'))).toBe(true);
  });

  it('a new device must be approved to take over a seat, and the old device is signed out', async () => {
    const { code, clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    const benId = idOf(ben);
    const phone2 = await Client.connect(code, tokenFor(77));
    await phone2.ok({ type: 'claim', playerId: benId });
    let s = await ana.settle();
    expect(s.room.claims).toHaveLength(1);
    expect(phone2.state.you.claimId).toBe(s.room.claims[0].id);
    await ana.ok({ type: 'resolveClaim', claimId: s.room.claims[0].id, allow: true });
    s = await phone2.settle();
    expect(s.you.id).toBe(benId);
    await ben.waitFor((m) => m.type === 'closed' && m.reason === 'replaced');
    expect(ana.state.room.log.at(-1)?.text).toBe('Ana moved Ben to a new device');
  });

  it('declined claims tell the requester', async () => {
    const { code, clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    const phone2 = await Client.connect(code, tokenFor(78));
    await phone2.ok({ type: 'claim', playerId: idOf(ben) });
    const claimId = (await ana.settle()).room.claims[0].id;
    await ana.ok({ type: 'resolveClaim', claimId, allow: false });
    await phone2.waitFor((m) => m.type === 'err' && m.code === 'FORBIDDEN');
    expect(phone2.state.you.id).toBeNull();
  });

  it('claims are approved automatically when nobody else is at the table', async () => {
    const { code, clients, idOf } = await table(['Ana']);
    const anaId = idOf(clients[0]);
    clients[0].ws.close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 50));
    const phone2 = await Client.connect(code, tokenFor(79));
    await phone2.ok({ type: 'claim', playerId: anaId });
    expect((await phone2.settle()).you.id).toBe(anaId);
  });

  it('kicking folds the player, closes their socket and passes nothing else', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben', 'Cat']);
    const [ana, ben, cat] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    expect(await ben.request({ type: 'kick', playerId: idOf(cat) })).toMatchObject({ code: 'FORBIDDEN' });
    await ana.ok({ type: 'kick', playerId: idOf(cat) });
    await cat.waitFor((m) => m.type === 'closed' && m.reason === 'kicked');
    const s = await ben.settle();
    const catSeat = s.room.game.players.find((p) => p.name === 'Cat');
    expect(catSeat?.folded).toBe(true);
    expect(s.room.members.map((m) => m.name)).toEqual(['Ana', 'Ben']);
  });

  it('when the host leaves, hosting passes to someone still here', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    await ana.ok({ type: 'leave' });
    const s = await ben.settle();
    expect(s.room.hostId).toBe(idOf(ben));
    expect(s.you.isHost).toBe(true);
  });

  it('host can be taken over only when the host is away', async () => {
    const { clients } = await table(['Ana', 'Ben']);
    const [ana, ben] = clients;
    expect(await ben.request({ type: 'takeHost' })).toMatchObject({ code: 'FORBIDDEN' });
    ana.ws.close(1000, 'bye');
    await new Promise((r) => setTimeout(r, 50));
    await ben.ok({ type: 'takeHost' });
    expect(ben.state.you.isHost).toBe(true);
  });
});

describe('lifecycle', () => {
  it('persists state and expires idle rooms', async () => {
    const { code, clients } = await table(['Ana', 'Ben']);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const stored = await runInDurableObject(stub, async (_, state) => state.storage.get<{ v: number }>('room'));
    expect(stored?.v).toBe(clients[0].state.v);
    expect(await runInDurableObject(stub, (_, state) => state.storage.getAlarm())).not.toBeNull();

    await runInDurableObject(stub, async (instance: unknown) => {
      (instance as { s: { lastActivity: number } }).s.lastActivity = 0;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await clients[0].waitFor((m) => m.type === 'closed' && m.reason === 'expired');
    expect((await api(`/api/rooms/${code}`)).status).toBe(404);
    const keys = await runInDurableObject(stub, (_, state) => state.storage.list());
    expect(keys.size).toBe(0);
  });
});
