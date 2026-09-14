import { describe, expect, it } from 'vitest';
import {
  act,
  addPlayer,
  award,
  canAct,
  createGame,
  findPlayer,
  legalActions,
  needsAction,
  removePlayer,
  RuleError,
  setSittingOut,
  setStack,
  startHand,
  type Game,
} from '../shared/engine';
import { mulberry32 } from './helpers';

const GAMES = Number(process.env.FUZZ_GAMES ?? 1500);

function totalChips(g: Game) {
  const paidOut = g.phase === 'showdown' ? g.pots.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0) : 0;
  return (
    g.players.reduce((s, p) => s + p.stack + p.committed, 0) +
    g.departed.reduce((s, d) => s + d.cashOut, 0) -
    paidOut
  );
}

function checkInvariants(g: Game, total: number, ctx: string) {
  const fail = (msg: string) => {
    throw new Error(`${ctx}: ${msg}\n${JSON.stringify(g)}`);
  };
  if (totalChips(g) !== total) fail(`chips ${totalChips(g)} != ${total}`);
  for (const p of g.players) {
    if (!Number.isSafeInteger(p.stack) || p.stack < 0) fail(`bad stack ${p.id}`);
    if (p.bet > p.committed) fail(`bet > committed ${p.id}`);
    if (g.phase === 'betting' && p.inHand && p.allIn !== (p.stack === 0)) fail(`allIn flag ${p.id}`);
  }
  if (g.phase === 'betting') {
    const actor = findPlayer(g, g.toActId);
    if (!actor) fail('betting with nobody to act');
    if (!canAct(actor!) || !needsAction(g, actor!)) fail('actor does not need to act');
    if (!legalActions(g, actor!.id)) fail('actor has no legal actions');
    if (g.minRaise < g.settings.bb) fail('min raise below big blind');
  } else if (g.toActId) fail('toActId outside betting');
  if (g.phase === 'showdown') {
    const committed = g.players.reduce((s, p) => s + p.committed, 0);
    const potSum = g.pots.reduce((s, p) => s + p.amount, 0);
    if (committed !== potSum) fail(`pots ${potSum} != committed ${committed}`);
    if (!g.pots.some((p) => !p.paid)) fail('showdown with nothing contested');
    for (let i = 0; i < g.pots.length; i++) {
      const pot = g.pots[i];
      if (pot.eligible.length === 0) fail('pot with nobody eligible');
      for (const id of pot.eligible) {
        const p = findPlayer(g, id);
        if (!p || p.folded || !p.inHand) fail('ineligible player in pot');
      }
      if (i > 0 && !pot.eligible.every((id) => g.pots[i - 1].eligible.includes(id))) {
        fail('side pot eligibility is not nested');
      }
    }
    // Every live player can win exactly what they matched from each opponent.
    const live = g.players.filter((p) => p.inHand && !p.folded);
    const top = Math.max(...live.map((p) => p.committed));
    const dead = g.players.reduce((s, p) => s + Math.max(0, p.committed - top), 0);
    for (const x of live) {
      const reachable = g.pots.filter((pot) => pot.eligible.includes(x.id)).reduce((s, pot) => s + pot.amount, 0);
      const matched = g.players.reduce((s, q) => s + Math.min(q.committed, x.committed), 0);
      const expected = matched + (x.committed === top ? dead : 0);
      if (reachable !== expected) fail(`player ${x.id} can win ${reachable}, expected ${expected}`);
    }
  }
}

function playGame(seed: number) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const n = 2 + Math.floor(rnd() * 8);
  const bb = pick([2, 10, 20]);
  const profile = pick(['short', 'mixed', 'deep']);
  let g = createGame({ sb: Math.max(1, Math.floor(bb / 2)), bb, startingStack: bb * 50, buyInPrice: 0 });
  for (let i = 0; i < n; i++) {
    g = addPlayer(g, `p${i}`, `P${i}`);
    const stack =
      profile === 'short'
        ? 1 + Math.floor(rnd() * bb * 3)
        : profile === 'mixed'
          ? 1 + Math.floor(rnd() * bb * 40)
          : bb * 50;
    g = setStack(g, `p${i}`, stack);
  }
  const total = totalChips(g);
  let lastBb: string | null = null;
  let hands = 0;
  const stats = { hands: 0, sidePots: 0, rejected: 0 };

  while (hands < 40) {
    const eligible = g.players.filter((p) => p.stack > 0 && !p.sittingOut);
    if (eligible.length < 2) break;
    g = startHand(g);
    hands += 1;
    stats.hands += 1;
    if (g.sbId === g.bbId) throw new Error(`seed ${seed}: sb and bb on the same player`);
    const inHand = g.players.filter((p) => p.inHand).length;
    if (inHand === 2 && g.buttonId !== g.sbId) throw new Error(`seed ${seed}: heads up button must post sb`);
    if (lastBb === g.bbId && inHand > 1) throw new Error(`seed ${seed}: ${lastBb} posted bb twice`);
    lastBb = g.bbId;
    checkInvariants(g, total, `seed ${seed} hand ${hands} start`);

    let steps = 0;
    while (g.phase === 'betting') {
      if (++steps > 500) throw new Error(`seed ${seed}: hand did not end`);
      const id = g.toActId!;
      const legal = legalActions(g, id)!;

      // Illegal attempts must be rejected and leave state untouched.
      const other = g.players.find((p) => p.id !== id && p.inHand);
      const snapshot = JSON.stringify(g);
      const attempts: (() => unknown)[] = [() => act(g, id, { kind: 'raise', amount: g.currentBet + 0.5 })];
      if (other) attempts.push(() => act(g, other.id, { kind: 'check' }));
      if (legal.canCheck) attempts.push(() => act(g, id, { kind: 'fold' }));
      if (!legal.canRaise) attempts.push(() => act(g, id, { kind: 'raise', amount: g.currentBet + g.minRaise }));
      for (const attempt of attempts) {
        try {
          attempt();
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
          stats.rejected += 1;
          continue;
        }
        throw new Error(`seed ${seed}: illegal action accepted`);
      }
      if (JSON.stringify(g) !== snapshot) throw new Error(`seed ${seed}: rejected action mutated state`);

      if (rnd() < 0.01) {
        const leaver = pick(g.players);
        g = removePlayer(g, leaver.id);
        checkInvariants(g, total, `seed ${seed} leave`);
        continue;
      }
      const r = rnd();
      if (legal.canFold && r < 0.2) g = act(g, id, { kind: 'fold' });
      else if (legal.canRaise && r < 0.55) {
        const shove = rnd() < 0.35;
        const amount = shove
          ? legal.maxRaiseTo
          : Math.min(legal.maxRaiseTo, legal.minRaiseTo + Math.floor(rnd() * g.settings.bb * 3));
        g = act(g, id, { kind: 'raise', amount });
      } else if (legal.canCheck) g = act(g, id, { kind: 'check' });
      else g = act(g, id, { kind: 'call' });
      checkInvariants(g, total, `seed ${seed} hand ${hands} step ${steps}`);
    }

    if (g.phase === 'showdown') {
      const open = g.pots.filter((p) => !p.paid);
      if (open.length > 1) stats.sidePots += 1;
      const winners: Record<string, string[]> = {};
      for (const pot of open) {
        const shuffled = [...pot.eligible].sort(() => rnd() - 0.5);
        winners[pot.id] = shuffled.slice(0, 1 + Math.floor(rnd() * Math.min(3, shuffled.length)));
      }
      g = award(g, winners);
    }
    expect(g.phase).toBe('done');
    checkInvariants(g, total, `seed ${seed} hand ${hands} done`);
    if (rnd() < 0.05 && g.players.length > 2) g = setSittingOut(g, pick(g.players).id, rnd() < 0.7);
  }
  return stats;
}

describe('engine fuzz', () => {
  it(`holds every invariant across ${GAMES} random games`, { timeout: 600_000 }, () => {
    const totals = { hands: 0, sidePots: 0, rejected: 0 };
    for (let seed = 1; seed <= GAMES; seed++) {
      const s = playGame(seed);
      totals.hands += s.hands;
      totals.sidePots += s.sidePots;
      totals.rejected += s.rejected;
    }
    expect(totals.hands).toBeGreaterThan(GAMES * 5);
    expect(totals.sidePots).toBeGreaterThan(0);
    expect(totals.rejected).toBeGreaterThan(0);
  });
});
