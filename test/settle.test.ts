import { describe, expect, it } from 'vitest';
import { act, removePlayer, startHand } from '../shared/engine';
import { ledger, netsInCents, settleUp } from '../shared/settle';
import { table } from './helpers';

describe('ledger', () => {
  it('counts seated players, chips still in the pot and players who left', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = act(g, 'p0', { kind: 'raise', amount: 200 });
    g = removePlayer(g, 'p1');
    const rows = ledger(g);
    expect(rows.find((r) => r.id === 'p0')).toMatchObject({ stack: 1000, net: 0 });
    g = act(g, 'p2', { kind: 'fold' });
    const after = ledger(g);
    expect(after.map((r) => [r.id, r.net, r.departed])).toEqual([
      ['p0', 15, false],
      ['p1', -5, true],
      ['p2', -10, false],
    ]);
    expect(after.reduce((s, r) => s + r.net, 0)).toBe(0);
  });
});

describe('settleUp', () => {
  it('produces at most n - 1 transfers that zero everyone out', () => {
    const nets = [
      { id: 'a', net: 700 },
      { id: 'b', net: -300 },
      { id: 'c', net: -250 },
      { id: 'd', net: 100 },
      { id: 'e', net: -250 },
    ];
    const transfers = settleUp(nets);
    expect(transfers.length).toBeLessThanOrEqual(nets.length - 1);
    const balance = new Map(nets.map((n) => [n.id, n.net]));
    for (const t of transfers) {
      balance.set(t.from, balance.get(t.from)! + t.amount);
      balance.set(t.to, balance.get(t.to)! - t.amount);
      expect(t.amount).toBeGreaterThan(0);
    }
    expect([...balance.values()].every((v) => v === 0)).toBe(true);
  });

  it('returns nothing when everyone is even', () => {
    expect(settleUp([{ id: 'a', net: 0 }, { id: 'b', net: 0 }])).toEqual([]);
  });
});

describe('netsInCents', () => {
  it('converts chips to cash and keeps the total at exactly zero', () => {
    const rows = [
      { id: 'a', name: 'A', buyIn: 1000, stack: 1333, net: 333, departed: false },
      { id: 'b', name: 'B', buyIn: 1000, stack: 667, net: -333, departed: false },
      { id: 'c', name: 'C', buyIn: 1000, stack: 1000, net: 0, departed: false },
    ];
    const cents = netsInCents(rows, 2000, 1000);
    expect(cents.get('a')).toBe(666);
    expect(cents.get('b')).toBe(-666);
    expect([...cents.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('handles uneven thirds without losing a cent', () => {
    const rows = ['a', 'b', 'c'].map((id, i) => ({
      id,
      name: id,
      buyIn: 300,
      stack: 300 + [1, 1, -2][i],
      net: [1, 1, -2][i],
      departed: false,
    }));
    const cents = netsInCents(rows, 1000, 3000);
    expect([...cents.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });

  it('is empty when no buy-in price is set', () => {
    expect(netsInCents([], 0, 1000).size).toBe(0);
  });
});
