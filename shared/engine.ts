// No-limit hold'em betting engine for live games: cards are physical, winners are picked by people.
// Pure functions over plain JSON state. Every mutation returns a new object or throws RuleError.

export type Phase = 'lobby' | 'betting' | 'showdown' | 'done';
export type Street = 0 | 1 | 2 | 3;
export type ActionKind = 'fold' | 'check' | 'call' | 'raise';

export interface Settings {
  sb: number;
  bb: number;
  startingStack: number;
  /** Cash price of one starting stack, in cents. 0 disables cash settlement. */
  buyInPrice: number;
}

export interface Player {
  id: string;
  name: string;
  seat: number;
  stack: number;
  /** Total chips this player has bought in for across the session. */
  buyIn: number;
  bet: number;
  committed: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  /** The bet level this player last acted at. Drives the raise reopening rule. */
  actedLevel: number;
  sittingOut: boolean;
  leaving: boolean;
}

export interface Pot {
  id: number;
  amount: number;
  eligible: string[];
  paid: boolean;
}

export interface Payout {
  potId: number;
  id: string;
  amount: number;
}

export interface Departed {
  id: string;
  name: string;
  buyIn: number;
  cashOut: number;
}

export interface LastAction {
  id: string;
  kind: ActionKind | 'sb' | 'bb';
  amount: number;
  allIn: boolean;
}

export interface Game {
  phase: Phase;
  settings: Settings;
  pendingSettings: Settings | null;
  handNo: number;
  players: Player[];
  departed: Departed[];
  buttonId: string | null;
  sbId: string | null;
  bbId: string | null;
  lastBbId: string | null;
  lastBbSeat: number | null;
  street: Street;
  currentBet: number;
  minRaise: number;
  toActId: string | null;
  pots: Pot[];
  results: Payout[];
  /** Showdown was reached before the river: the dealer must run out the board. */
  runout: boolean;
  lastAction: LastAction | null;
}

export interface Legal {
  toCall: number;
  canCheck: boolean;
  canFold: boolean;
  canCall: boolean;
  callAmount: number;
  callIsAllIn: boolean;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export type RuleCode = 'PHASE' | 'NOT_TURN' | 'INVALID';

export class RuleError extends Error {
  constructor(
    public code: RuleCode,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_PLAYERS = 10;
export const LIMITS = { maxBlind: 1_000_000, maxStack: 1_000_000_000, maxPrice: 10_000_000 };

const fail = (code: RuleCode, message: string): never => {
  throw new RuleError(code, message);
};

const clone = <T>(v: T): T => structuredClone(v);
const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;

export function validateSettings(s: Settings): Settings {
  const ok =
    isInt(s.bb, 1, LIMITS.maxBlind) &&
    isInt(s.sb, 0, s.bb) &&
    isInt(s.startingStack, s.bb, LIMITS.maxStack) &&
    isInt(s.buyInPrice, 0, LIMITS.maxPrice);
  if (!ok) fail('INVALID', 'Blinds or stack are out of range');
  return { sb: s.sb, bb: s.bb, startingStack: s.startingStack, buyInPrice: s.buyInPrice };
}

export function createGame(settings: Settings): Game {
  return {
    phase: 'lobby',
    settings: validateSettings(settings),
    pendingSettings: null,
    handNo: 0,
    players: [],
    departed: [],
    buttonId: null,
    sbId: null,
    bbId: null,
    lastBbId: null,
    lastBbSeat: null,
    street: 0,
    currentBet: 0,
    minRaise: settings.bb,
    toActId: null,
    pots: [],
    results: [],
    runout: false,
    lastAction: null,
  };
}

// ---------- queries ----------

export const findPlayer = (g: Game, id: string | null | undefined) =>
  id ? g.players.find((p) => p.id === id) : undefined;

const must = (g: Game, id: string): Player => findPlayer(g, id) ?? fail('INVALID', 'Unknown player');

export const bySeat = (g: Game) => [...g.players].sort((a, b) => a.seat - b.seat);
export const canAct = (p: Player) => p.inHand && !p.folded && !p.allIn;
export const livePlayers = (g: Game) => g.players.filter((p) => p.inHand && !p.folded);
export const handInProgress = (g: Game) => g.phase === 'betting' || g.phase === 'showdown';
export const potTotal = (g: Game) => g.players.reduce((sum, p) => sum + p.committed, 0);
export const eligibleForHand = (p: Player) => !p.sittingOut && !p.leaving && p.stack > 0;

/** Players strictly clockwise after `fromSeat`, wrapping around, filtered. */
function clockwise(g: Game, fromSeat: number, pred: (p: Player) => boolean): Player[] {
  const ps = bySeat(g);
  const after = ps.filter((p) => p.seat > fromSeat);
  const before = ps.filter((p) => p.seat <= fromSeat);
  return [...after, ...before].filter(pred);
}

export function needsAction(g: Game, p: Player): boolean {
  if (!canAct(p)) return false;
  const actors = g.players.filter(canAct);
  if (actors.length === 1) {
    const maxOther = Math.max(0, ...livePlayers(g).filter((q) => q.id !== p.id).map((q) => q.bet));
    if (p.bet >= maxOther) return false;
  }
  return !p.acted || p.bet < g.currentBet;
}

function raiseAllowed(g: Game, p: Player): boolean {
  if (!canAct(p)) return false;
  if (p.stack + p.bet <= g.currentBet) return false;
  if (!g.players.some((q) => q.id !== p.id && canAct(q))) return false;
  // TDA 47: a player who already acted may re-raise only when facing at least a full raise since then.
  return !p.acted || g.currentBet - p.actedLevel >= g.minRaise;
}

export function legalActions(g: Game, id: string): Legal | null {
  const p = findPlayer(g, id);
  if (!p || g.phase !== 'betting' || g.toActId !== id) return null;
  const toCall = Math.max(0, g.currentBet - p.bet);
  const callAmount = Math.min(toCall, p.stack);
  const canRaise = raiseAllowed(g, p);
  const maxRaiseTo = p.bet + p.stack;
  return {
    toCall,
    canCheck: toCall === 0,
    canFold: toCall > 0,
    canCall: toCall > 0,
    callAmount,
    callIsAllIn: toCall > 0 && callAmount === p.stack,
    canRaise,
    minRaiseTo: canRaise ? Math.min(maxRaiseTo, g.currentBet + g.minRaise) : 0,
    maxRaiseTo: canRaise ? maxRaiseTo : 0,
  };
}

// ---------- table management ----------

export function addPlayer(g0: Game, id: string, name: string): Game {
  if (findPlayer(g0, id)) fail('INVALID', 'Already seated');
  if (g0.players.length >= MAX_PLAYERS) fail('INVALID', 'Table is full');
  const g = clone(g0);
  const seat = g.players.reduce((m, p) => Math.max(m, p.seat), -1) + 1;
  const stack = g.settings.startingStack;
  g.players.push({
    id,
    name,
    seat,
    stack,
    buyIn: stack,
    bet: 0,
    committed: 0,
    inHand: false,
    folded: false,
    allIn: false,
    acted: false,
    actedLevel: 0,
    sittingOut: false,
    leaving: false,
  });
  return g;
}

function depart(g: Game, p: Player) {
  g.players = g.players.filter((q) => q.id !== p.id);
  if (g.handNo > 0 || p.buyIn !== p.stack) {
    g.departed.push({ id: p.id, name: p.name, buyIn: p.buyIn, cashOut: p.stack });
  }
}

/** Leave or kick. A player in a live hand is folded; their chips stay in the pot until the hand ends. */
export function removePlayer(g0: Game, id: string): Game {
  const g = clone(g0);
  const p = must(g, id);
  if (!handInProgress(g) || !p.inHand) {
    depart(g, p);
    return g;
  }
  p.leaving = true;
  if (g.phase === 'betting' && !p.folded) {
    p.folded = true;
    const cur = findPlayer(g, g.toActId);
    if (g.toActId === id || !cur) advance(g, p.seat);
    else if (livePlayers(g).length === 1 || !needsAction(g, cur)) advance(g, cur.seat);
  } else if (g.phase === 'showdown' && !p.folded) {
    p.folded = true;
    for (const pot of g.pots.filter((x) => !x.paid)) {
      pot.eligible = pot.eligible.filter((x) => x !== id);
      if (pot.eligible.length === 1) payout(g, pot, pot.eligible);
    }
    if (g.pots.every((x) => x.paid)) finish(g);
  }
  return g;
}

export function renamePlayer(g0: Game, id: string, name: string): Game {
  const g = clone(g0);
  must(g, id).name = name;
  return g;
}

export function setSeatOrder(g0: Game, ids: string[]): Game {
  if (handInProgress(g0)) fail('PHASE', 'Reorder seats between hands');
  const current = g0.players.map((p) => p.id).sort();
  const next = [...ids].sort();
  if (current.length !== next.length || current.some((id, i) => id !== next[i])) {
    fail('INVALID', 'Seat order must list every player once');
  }
  const g = clone(g0);
  ids.forEach((id, i) => {
    must(g, id).seat = i;
  });
  return g;
}

export function updateSettings(g0: Game, settings: Settings): Game {
  const s = validateSettings(settings);
  const g = clone(g0);
  if (handInProgress(g)) g.pendingSettings = s;
  else {
    g.settings = s;
    g.pendingSettings = null;
    g.minRaise = s.bb;
  }
  return g;
}

export function setStack(g0: Game, id: string, stack: number): Game {
  if (!isInt(stack, 0, LIMITS.maxStack)) fail('INVALID', 'Stack is out of range');
  const p0 = must(g0, id);
  if (handInProgress(g0) && p0.inHand) fail('PHASE', 'Change stacks after this hand');
  const g = clone(g0);
  const p = must(g, id);
  p.buyIn += stack - p.stack;
  p.stack = stack;
  return g;
}

export function rebuy(g0: Game, id: string): Game {
  const p0 = must(g0, id);
  if (handInProgress(g0) && p0.inHand) fail('PHASE', 'Rebuy after this hand');
  if (p0.stack > 0) fail('INVALID', 'You still have chips');
  const g = clone(g0);
  const p = must(g, id);
  p.stack = g.settings.startingStack;
  p.buyIn += g.settings.startingStack;
  return g;
}

export function setSittingOut(g0: Game, id: string, out: boolean): Game {
  const g = clone(g0);
  must(g, id).sittingOut = out;
  return g;
}

// ---------- hand flow ----------

function post(p: Player, amount: number): number {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

export function startHand(g0: Game): Game {
  if (handInProgress(g0)) fail('PHASE', 'A hand is already running');
  const g = clone(g0);
  if (g.pendingSettings) {
    g.settings = g.pendingSettings;
    g.pendingSettings = null;
  }
  const elig = bySeat(g).filter(eligibleForHand);
  if (elig.length < 2) fail('INVALID', 'Need at least two players with chips');

  let bbP: Player;
  const lastBb = findPlayer(g, g.lastBbId);
  if (lastBb || g.lastBbSeat !== null) {
    // The big blind moves exactly one eligible seat, so nobody posts it twice in a row.
    bbP = clockwise(g, lastBb ? lastBb.seat : (g.lastBbSeat as number), eligibleForHand)[0];
  } else {
    bbP = elig.length === 2 ? elig[1] : elig[2];
  }
  const behind = clockwise(g, bbP.seat, (q) => eligibleForHand(q) && q.id !== bbP.id).reverse();
  const sbP = behind[0];
  const btnP = elig.length === 2 ? sbP : behind[1];

  for (const p of g.players) {
    Object.assign(p, {
      bet: 0,
      committed: 0,
      inHand: eligibleForHand(p),
      folded: false,
      allIn: false,
      acted: false,
      actedLevel: 0,
    });
  }
  g.handNo += 1;
  g.phase = 'betting';
  g.street = 0;
  g.pots = [];
  g.results = [];
  g.runout = false;
  g.buttonId = btnP.id;
  g.sbId = sbP.id;
  g.bbId = bbP.id;
  g.lastBbId = bbP.id;
  g.lastBbSeat = bbP.seat;
  const sbPaid = post(sbP, g.settings.sb);
  const bbPaid = post(bbP, g.settings.bb);
  g.lastAction = { id: bbP.id, kind: 'bb', amount: bbPaid, allIn: bbP.allIn };
  void sbPaid;
  g.currentBet = g.settings.bb;
  g.minRaise = g.settings.bb;
  g.toActId = null;
  advance(g, bbP.seat);
  return g;
}

export function act(g0: Game, id: string, action: { kind: ActionKind; amount?: number }): Game {
  if (g0.phase !== 'betting') fail('PHASE', 'No betting right now');
  if (g0.toActId !== id) fail('NOT_TURN', 'Not your turn');
  const g = clone(g0);
  const p = must(g, id);
  const toCall = g.currentBet - p.bet;
  switch (action.kind) {
    case 'fold':
      if (toCall <= 0) fail('INVALID', 'Checking is free');
      p.folded = true;
      g.lastAction = { id, kind: 'fold', amount: 0, allIn: false };
      break;
    case 'check':
      if (toCall > 0) fail('INVALID', 'You need to call or fold');
      p.acted = true;
      p.actedLevel = g.currentBet;
      g.lastAction = { id, kind: 'check', amount: 0, allIn: false };
      break;
    case 'call': {
      if (toCall <= 0) fail('INVALID', 'Nothing to call');
      const paid = post(p, toCall);
      p.acted = true;
      p.actedLevel = g.currentBet;
      g.lastAction = { id, kind: 'call', amount: paid, allIn: p.allIn };
      break;
    }
    case 'raise': {
      if (!raiseAllowed(g, p)) fail('INVALID', 'Raising is not allowed');
      const to = action.amount;
      const max = p.bet + p.stack;
      if (!isInt(to, 1, LIMITS.maxStack) || to <= g.currentBet || to > max) fail('INVALID', 'Invalid amount');
      const target = to as number;
      const inc = target - g.currentBet;
      if (inc < g.minRaise && target !== max) {
        fail('INVALID', `Minimum is ${g.currentBet + g.minRaise}`);
      }
      post(p, target - p.bet);
      if (inc >= g.minRaise) g.minRaise = inc;
      g.currentBet = target;
      p.acted = true;
      p.actedLevel = target;
      g.lastAction = { id, kind: 'raise', amount: target, allIn: p.allIn };
      break;
    }
    default:
      fail('INVALID', 'Unknown action');
  }
  advance(g, p.seat);
  return g;
}

function advance(g: Game, fromSeat: number) {
  if (livePlayers(g).length <= 1) {
    enterShowdown(g);
    return;
  }
  const next = clockwise(g, fromSeat, (q) => needsAction(g, q))[0];
  if (next) {
    g.toActId = next.id;
    return;
  }
  const actors = g.players.filter(canAct).length;
  if (g.street === 3 || actors <= 1) {
    enterShowdown(g);
    return;
  }
  g.street = (g.street + 1) as Street;
  for (const q of g.players) {
    q.bet = 0;
    q.acted = false;
    q.actedLevel = 0;
  }
  g.currentBet = 0;
  g.minRaise = g.settings.bb;
  const button = findPlayer(g, g.buttonId);
  g.toActId = clockwise(g, button ? button.seat : -1, (q) => needsAction(g, q))[0]?.id ?? null;
  if (!g.toActId) enterShowdown(g);
}

/** Layered pots from total contributions. Folded chips are dead money; identical eligibility merges. */
export function buildPots(g: Game): Pot[] {
  const contributors = g.players.filter((p) => p.committed > 0);
  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
  const pots: Omit<Pot, 'id'>[] = [];
  let prev = 0;
  let carry = 0;
  for (const level of levels) {
    let amount = contributors.reduce(
      (sum, p) => sum + Math.min(p.committed, level) - Math.min(p.committed, prev),
      0,
    );
    const eligible = g.players
      .filter((p) => p.inHand && !p.folded && p.committed >= level)
      .map((p) => p.id)
      .sort();
    prev = level;
    if (eligible.length === 0) {
      const last = pots[pots.length - 1];
      if (last) last.amount += amount;
      else carry += amount;
      continue;
    }
    amount += carry;
    carry = 0;
    const last = pots[pots.length - 1];
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible, paid: false });
  }
  if (carry > 0) {
    pots.push({ amount: carry, eligible: livePlayers(g).map((p) => p.id).sort(), paid: false });
  }
  return pots.map((p, i) => ({ id: i, ...p }));
}

function enterShowdown(g: Game) {
  g.toActId = null;
  g.pots = buildPots(g);
  g.phase = 'showdown';
  g.results = [];
  g.runout = g.street < 3 && livePlayers(g).length > 1;
  for (const pot of g.pots.filter((p) => p.eligible.length === 1)) payout(g, pot, pot.eligible);
  if (g.pots.every((p) => p.paid)) finish(g);
}

/**
 * How a pot divides between winners, clockwise from the button so odd chips land the
 * same way every time. The dock previews a split with this, so what you see is paid.
 */
export function shareOut(g: Game, amount: number, winners: string[]): { id: string; amount: number }[] {
  const button = findPlayer(g, g.buttonId);
  const order = clockwise(g, button ? button.seat : -1, (q) => winners.includes(q.id));
  const share = Math.floor(amount / order.length);
  let odd = amount - share * order.length;
  return order.map((w) => {
    const take = share + (odd > 0 ? 1 : 0);
    odd -= 1;
    return { id: w.id, amount: take };
  });
}

function payout(g: Game, pot: Pot, winners: string[]) {
  for (const { id, amount } of shareOut(g, pot.amount, winners)) {
    const w = findPlayer(g, id)!;
    w.stack += amount;
    g.results.push({ potId: pot.id, id, amount });
  }
  pot.paid = true;
}

function finish(g: Game) {
  for (const p of g.players) {
    p.committed = 0;
    p.bet = 0;
    p.allIn = false;
    p.inHand = false;
    p.acted = false;
    p.actedLevel = 0;
  }
  g.phase = 'done';
  g.toActId = null;
  g.currentBet = 0;
  for (const p of g.players.filter((q) => q.leaving)) depart(g, p);
}

/** winners maps pot id to the ids that split it. Every unpaid pot must be covered. */
export function award(g0: Game, winners: Record<string, string[]>): Game {
  if (g0.phase !== 'showdown') fail('PHASE', 'Nothing to award');
  const g = clone(g0);
  const unpaid = g.pots.filter((p) => !p.paid);
  for (const pot of unpaid) {
    const w = winners[String(pot.id)];
    const valid =
      Array.isArray(w) &&
      w.length > 0 &&
      new Set(w).size === w.length &&
      w.every((id) => pot.eligible.includes(id));
    if (!valid) fail('INVALID', 'Pick a winner for every pot');
  }
  for (const pot of unpaid) payout(g, pot, winners[String(pot.id)]);
  finish(g);
  return g;
}

/** Chips in play: stacks plus everything committed. Constant across betting and awards. */
export const chipsInPlay = (g: Game) => g.players.reduce((s, p) => s + p.stack + p.committed, 0);
