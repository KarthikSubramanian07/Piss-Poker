import { describe, expect, it } from 'vitest';
import {
  act,
  addPlayer,
  award,
  chipsInPlay,
  findPlayer,
  legalActions,
  potTotal,
  rebuy,
  removePlayer,
  RuleError,
  setSeatOrder,
  setSittingOut,
  setStack,
  shareOut,
  startHand,
  updateSettings,
  type Game,
} from '../shared/engine';
import { stacks, table } from './helpers';

const p = (g: Game, id: string) => findPlayer(g, id)!;
const call = (g: Game, id: string) => act(g, id, { kind: 'call' });
const check = (g: Game, id: string) => act(g, id, { kind: 'check' });
const fold = (g: Game, id: string) => act(g, id, { kind: 'fold' });
const raise = (g: Game, id: string, amount: number) => act(g, id, { kind: 'raise', amount });

function checkDown(g: Game): Game {
  let s = g;
  while (s.phase === 'betting') s = check(s, s.toActId!);
  return s;
}

function expectRule(fn: () => unknown, code?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RuleError);
    if (code) expect((e as RuleError).code).toBe(code);
    return;
  }
  throw new Error('expected a RuleError');
}

describe('blinds and action order', () => {
  it('three handed: button p0, blinds p1/p2, button acts first', () => {
    const g = startHand(table([1000, 1000, 1000]));
    expect([g.buttonId, g.sbId, g.bbId, g.toActId]).toEqual(['p0', 'p1', 'p2', 'p0']);
    expect([p(g, 'p1').bet, p(g, 'p2').bet, g.currentBet]).toEqual([5, 10, 10]);
  });

  it('four handed: under the gun acts first', () => {
    const g = startHand(table([1000, 1000, 1000, 1000]));
    expect(g.toActId).toBe('p3');
  });

  it('big blind keeps the option after limps, then small blind opens the flop', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = call(g, 'p0');
    g = call(g, 'p1');
    expect(g.toActId).toBe('p2');
    const legal = legalActions(g, 'p2')!;
    expect(legal.canCheck).toBe(true);
    expect(legal.canFold).toBe(false);
    expect(legal.canRaise).toBe(true);
    expect(legal.minRaiseTo).toBe(20);
    g = check(g, 'p2');
    expect(g.street).toBe(1);
    expect(g.toActId).toBe('p1');
  });

  it('heads up: button posts small blind, acts first preflop and last after the flop', () => {
    let g = startHand(table([1000, 1000]));
    expect([g.buttonId, g.sbId, g.bbId, g.toActId]).toEqual(['p0', 'p0', 'p1', 'p0']);
    g = call(g, 'p0');
    g = check(g, 'p1');
    expect(g.street).toBe(1);
    expect(g.toActId).toBe('p1');
  });

  it('big blind moves one seat per hand around a full table', () => {
    let g = table([1000, 1000, 1000]);
    const bbs: string[] = [];
    for (let i = 0; i < 4; i++) {
      g = startHand(g);
      bbs.push(g.bbId!);
      while (g.phase === 'betting') g = fold(g, g.toActId!);
    }
    expect(bbs).toEqual(['p2', 'p0', 'p1', 'p2']);
  });

  it('nobody posts the big blind twice when the table drops to two', () => {
    let g = startHand(table([1000, 1000, 1000]));
    expect(g.bbId).toBe('p2');
    g = fold(fold(g, 'p0'), 'p1');
    g = setSittingOut(g, 'p1', true);
    g = startHand(g);
    expect(g.bbId).toBe('p0');
    expect(g.sbId).toBe('p2');
    expect(g.buttonId).toBe('p2');
    expect(g.toActId).toBe('p2');
  });

  it('seat order set by the host drives the rotation', () => {
    let g = table([1000, 1000, 1000]);
    g = setSeatOrder(g, ['p2', 'p0', 'p1']);
    g = startHand(g);
    expect([g.buttonId, g.sbId, g.bbId]).toEqual(['p2', 'p0', 'p1']);
  });

  it('short big blind: callers still owe the full blind', () => {
    let g = startHand(table([1000, 1000, 4]));
    expect(p(g, 'p2').allIn).toBe(true);
    expect(legalActions(g, 'p0')).toMatchObject({ toCall: 10, minRaiseTo: 20 });
    g = call(g, 'p0');
    g = call(g, 'p1');
    expect(g.street).toBe(1);
    g = checkDown(g);
    expect(g.phase).toBe('showdown');
    expect(g.pots.map((x) => [x.amount, x.eligible])).toEqual([
      [12, ['p0', 'p1', 'p2']],
      [12, ['p0', 'p1']],
    ]);
  });

  it('heads up small blind all in for less than the big blind: no action, excess returned', () => {
    const g = startHand(table([3, 1000]));
    expect(g.phase).toBe('showdown');
    expect(g.runout).toBe(true);
    const contested = g.pots.filter((x) => !x.paid);
    expect(contested.map((x) => x.amount)).toEqual([6]);
    expect(p(g, 'p1').stack).toBe(1000 - 10 + 7);
  });

  it('everyone folds to the big blind', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = fold(fold(g, 'p0'), 'p1');
    expect(g.phase).toBe('done');
    expect(stacks(g)).toEqual({ p0: 1000, p1: 995, p2: 1005 });
  });
});

describe('bets and raises', () => {
  it('min bet is the big blind, min raise tracks the last full raise', () => {
    let g = startHand(table([1000, 1000]));
    g = check(call(g, 'p0'), 'p1');
    expect(legalActions(g, 'p1')!.minRaiseTo).toBe(10);
    expectRule(() => raise(g, 'p1', 9), 'INVALID');
    g = raise(g, 'p1', 30);
    expect(legalActions(g, 'p0')!.minRaiseTo).toBe(60);
    expectRule(() => raise(g, 'p0', 59), 'INVALID');
    g = raise(g, 'p0', 100);
    expect(legalActions(g, 'p1')!.minRaiseTo).toBe(170);
  });

  it('all-in bet smaller than the big blind keeps the full minimum raise', () => {
    let g = startHand(table([1000, 1000, 25], { sb: 10, bb: 20 }));
    g = check(call(call(g, 'p0'), 'p1'), 'p2');
    expect(g.street).toBe(1);
    g = check(g, 'p1');
    g = raise(g, 'p2', 5);
    expect(p(g, 'p2').allIn).toBe(true);
    expect(legalActions(g, 'p0')).toMatchObject({ toCall: 5, canRaise: true, minRaiseTo: 25 });
  });

  it('short all-in raise does not reopen betting for players who already acted', () => {
    let g = startHand(table([80, 1000, 1000, 1000], { sb: 10, bb: 20 }));
    g = raise(g, 'p3', 60);
    g = raise(g, 'p0', 80);
    expect(p(g, 'p0').allIn).toBe(true);
    expect(legalActions(g, 'p1')).toMatchObject({ canRaise: true, minRaiseTo: 120 });
    g = call(g, 'p1');
    g = call(g, 'p2');
    expect(legalActions(g, 'p3')).toMatchObject({ canCall: true, toCall: 20, canRaise: false });
    expectRule(() => raise(g, 'p3', 1000), 'INVALID');
  });

  it('several short all-ins that add up to a full raise do reopen betting', () => {
    let g = startHand(table([1000, 200, 1000, 1000, 150], { sb: 10, bb: 20 }));
    g = raise(g, 'p3', 100);
    g = raise(g, 'p4', 150);
    g = call(g, 'p0');
    g = raise(g, 'p1', 200);
    g = call(g, 'p2');
    expect(g.toActId).toBe('p3');
    expect(legalActions(g, 'p3')!.canRaise).toBe(true);
    g = call(g, 'p3');
    expect(g.toActId).toBe('p0');
    expect(legalActions(g, 'p0')).toMatchObject({ toCall: 50, canRaise: false });
  });

  it('last live player facing an all-in may only call or fold', () => {
    let g = startHand(table([1000, 1000, 300]));
    g = fold(g, 'p0');
    g = raise(g, 'p1', 1000);
    expect(legalActions(g, 'p2')).toMatchObject({ canRaise: false, canCall: true, callIsAllIn: true, callAmount: 290 });
    g = call(g, 'p2');
    expect(g.phase).toBe('showdown');
    expect(g.runout).toBe(true);
  });

  it('rejects folding when checking is free, acting out of turn and bad amounts', () => {
    let g = startHand(table([1000, 1000, 1000]));
    expectRule(() => call(g, 'p1'), 'NOT_TURN');
    expectRule(() => raise(g, 'p0', 25.5), 'INVALID');
    expectRule(() => raise(g, 'p0', 15), 'INVALID');
    g = call(call(g, 'p0'), 'p1');
    expectRule(() => fold(g, 'p2'), 'INVALID');
    expectRule(() => call(g, 'p2'), 'INVALID');
  });

  it('never mutates the input state', () => {
    const g = startHand(table([1000, 1000, 1000]));
    const frozen = JSON.stringify(g);
    raise(g, 'p0', 50);
    expectRule(() => raise(g, 'p0', 12));
    expect(JSON.stringify(g)).toBe(frozen);
  });
});

describe('pots and showdown', () => {
  it('three stacks all in: main pot, side pot and uncalled chips returned', () => {
    let g = startHand(table([500, 100, 250]));
    g = raise(g, 'p0', 500);
    g = call(g, 'p1');
    g = call(g, 'p2');
    expect(g.phase).toBe('showdown');
    expect(g.runout).toBe(true);
    const contested = g.pots.filter((x) => !x.paid).map((x) => [x.amount, x.eligible]);
    expect(contested).toEqual([
      [300, ['p0', 'p1', 'p2']],
      [300, ['p0', 'p2']],
    ]);
    expect(p(g, 'p0').stack).toBe(250);
    const [main, side] = g.pots.filter((x) => !x.paid);
    g = award(g, { [main.id]: ['p1'], [side.id]: ['p2'] });
    expect(stacks(g)).toEqual({ p0: 250, p1: 300, p2: 300 });
    expect(g.phase).toBe('done');
  });

  it('folded chips stay in the pot but the folder is never eligible', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = call(g, 'p0');
    g = fold(g, 'p1');
    g = checkDown(check(g, 'p2'));
    expect(g.pots.map((x) => [x.amount, x.eligible])).toEqual([[25, ['p0', 'p2']]]);
    g = award(g, { 0: ['p0', 'p2'] });
    expect(stacks(g)).toEqual({ p0: 1002, p1: 995, p2: 1003 });
  });

  it('three way tie with two odd chips pays clockwise from the button', () => {
    let g = startHand(table([1000, 1000, 1000, 1000], { sb: 1, bb: 2 }));
    g = call(g, 'p3');
    g = call(g, 'p0');
    g = call(g, 'p1');
    g = checkDown(check(g, 'p2'));
    expect(g.pots[0].amount).toBe(8);
    g = award(g, { 0: ['p0', 'p2', 'p3'] });
    expect(g.results.map((r) => [r.id, r.amount])).toEqual([
      ['p2', 3],
      ['p3', 3],
      ['p0', 2],
    ]);
  });

  it('shareOut previews exactly what award pays, odd chips included', () => {
    let g = startHand(table([1000, 1000, 1000, 1000], { sb: 1, bb: 2 }));
    g = call(g, 'p3');
    g = call(g, 'p0');
    g = call(g, 'p1');
    g = checkDown(check(g, 'p2'));
    const preview = shareOut(g, g.pots[0].amount, ['p0', 'p2', 'p3']);
    expect(preview).toEqual([
      { id: 'p2', amount: 3 },
      { id: 'p3', amount: 3 },
      { id: 'p0', amount: 2 },
    ]);
    expect(preview.reduce((sum, r) => sum + r.amount, 0)).toBe(g.pots[0].amount);
    const paid = award(g, { 0: ['p0', 'p2', 'p3'] });
    expect(paid.results.map((r) => ({ id: r.id, amount: r.amount }))).toEqual(preview);
  });

  it('dead money above every live player merges into the top live pot', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = raise(g, 'p0', 400);
    g = removePlayer(g, 'p0');
    expect(g.currentBet).toBe(400);
    g = fold(g, 'p1');
    expect(g.phase).toBe('done');
    expect(stacks(g)).toEqual({ p1: 995, p2: 1405 });
    expect(g.departed).toEqual([{ id: 'p0', name: 'P0', buyIn: 1000, cashOut: 600 }]);
  });

  it('dead money when someone folds after an all in', () => {
    let g = startHand(table([1000, 1000, 100]));
    g = raise(g, 'p0', 300);
    g = call(g, 'p1');
    g = call(g, 'p2');
    expect(g.street).toBe(1);
    g = raise(g, 'p1', 200);
    g = fold(g, 'p0');
    expect(g.phase).toBe('showdown');
    const contested = g.pots.filter((x) => !x.paid);
    expect(contested.map((x) => [x.amount, x.eligible])).toEqual([[300, ['p1', 'p2']]]);
    expect(potTotal(g)).toBe(900);
    g = award(g, { [contested[0].id]: ['p2'] });
    expect(stacks(g)).toEqual({ p0: 700, p1: 1100, p2: 300 });
    expect(chipsInPlay(g)).toBe(2100);
  });

  it('award must cover every contested pot with eligible, distinct winners', () => {
    let g = startHand(table([500, 100, 250]));
    g = call(call(raise(g, 'p0', 500), 'p1'), 'p2');
    const [main, side] = g.pots.filter((x) => !x.paid);
    expectRule(() => award(g, { [main.id]: ['p1'] }), 'INVALID');
    expectRule(() => award(g, { [main.id]: ['p1'], [side.id]: ['p1'] }), 'INVALID');
    expectRule(() => award(g, { [main.id]: ['p1', 'p1'], [side.id]: ['p2'] }), 'INVALID');
    g = award(g, { [main.id]: ['p0'], [side.id]: ['p0'] });
    expectRule(() => award(g, { [main.id]: ['p0'] }), 'PHASE');
  });
});

describe('table changes', () => {
  it('leaving on your own turn folds you and the hand moves on', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = removePlayer(g, 'p0');
    expect(p(g, 'p0').folded).toBe(true);
    expect(g.toActId).toBe('p1');
    g = fold(g, 'p1');
    expect(g.phase).toBe('done');
    expect(findPlayer(g, 'p0')).toBeUndefined();
    expect(g.departed).toEqual([{ id: 'p0', name: 'P0', buyIn: 1000, cashOut: 1000 }]);
  });

  it('when the last opponent leaves, the remaining player takes the pot and their uncalled raise', () => {
    let g = startHand(table([1000, 1000]));
    g = raise(g, 'p0', 300);
    g = removePlayer(g, 'p1');
    expect(g.phase).toBe('done');
    expect(p(g, 'p0').stack).toBe(1010);
    expect(g.departed[0].cashOut).toBe(990);
  });

  it('leaving out of turn keeps the current actor', () => {
    let g = startHand(table([1000, 1000, 1000, 1000]));
    g = removePlayer(g, 'p1');
    expect(g.toActId).toBe('p3');
    expect(chipsInPlay(g)).toBe(4000);
  });

  it('leaving at showdown drops eligibility and pays single-eligible pots', () => {
    let g = startHand(table([500, 100, 250]));
    g = call(call(raise(g, 'p0', 500), 'p1'), 'p2');
    g = removePlayer(g, 'p0');
    const open = g.pots.filter((x) => !x.paid);
    expect(open.map((x) => x.eligible)).toEqual([['p1', 'p2']]);
    g = award(g, { [open[0].id]: ['p1'] });
    expect(g.phase).toBe('done');
    expect(g.departed[0]).toMatchObject({ id: 'p0', cashOut: 250 });
    expect(stacks(g)).toEqual({ p1: 300, p2: 300 });
  });

  it('players who join mid hand wait for the next deal', () => {
    let g = startHand(table([1000, 1000]));
    g = addPlayer(g, 'p9', 'Late');
    expect(p(g, 'p9').inHand).toBe(false);
    expect(g.toActId).toBe('p0');
    g = fold(g, 'p0');
    g = startHand(g);
    expect(p(g, 'p9').inHand).toBe(true);
  });

  it('settings changed mid hand apply from the next hand', () => {
    let g = startHand(table([1000, 1000]));
    g = updateSettings(g, { sb: 25, bb: 50, startingStack: 2000, buyInPrice: 2000 });
    expect(g.settings.bb).toBe(10);
    expect(g.pendingSettings?.bb).toBe(50);
    g = startHand(fold(g, 'p0'));
    expect(g.settings.bb).toBe(50);
    expect(g.currentBet).toBe(50);
    expectRule(() => updateSettings(g, { sb: 60, bb: 50, startingStack: 2000, buyInPrice: 0 }), 'INVALID');
  });

  it('stack edits and rebuys wait until the player is out of the hand', () => {
    let g = startHand(table([1000, 1000, 1000]));
    expectRule(() => setStack(g, 'p0', 5000), 'PHASE');
    expectRule(() => rebuy(g, 'p0'), 'PHASE');
    g = setSittingOut(g, 'p1', true);
    g = fold(g, 'p0');
    g = fold(g, 'p1');
    g = setStack(g, 'p0', 0);
    expect(p(g, 'p0').buyIn).toBe(0);
    g = rebuy(g, 'p0');
    expect(p(g, 'p0')).toMatchObject({ stack: 1000, buyIn: 1000 });
    expectRule(() => rebuy(g, 'p1'), 'INVALID');
  });

  it('busted and sitting out players are skipped when dealing', () => {
    let g = table([1000, 0, 1000, 1000]);
    g = setSittingOut(g, 'p3', true);
    expectRule(() => startHand(setSittingOut(g, 'p2', true)), 'INVALID');
    g = startHand(g);
    expect(g.players.filter((x) => x.inHand).map((x) => x.id)).toEqual(['p0', 'p2']);
    expect(g.buttonId).toBe(g.sbId);
  });

  it('seat order can only change between hands', () => {
    const g = startHand(table([1000, 1000]));
    expectRule(() => setSeatOrder(g, ['p1', 'p0']), 'PHASE');
    expectRule(() => setSeatOrder(table([1000, 1000]), ['p1']), 'INVALID');
  });
});
