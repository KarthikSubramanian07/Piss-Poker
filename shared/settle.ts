import type { Game } from './engine';

export interface LedgerRow {
  id: string;
  name: string;
  buyIn: number;
  stack: number;
  net: number;
  departed: boolean;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export function ledger(g: Game): LedgerRow[] {
  const seated = g.players.map((p) => {
    const stack = p.stack + p.committed;
    return { id: p.id, name: p.name, buyIn: p.buyIn, stack, net: stack - p.buyIn, departed: false };
  });
  const gone = g.departed.map((d) => ({
    id: d.id,
    name: d.name,
    buyIn: d.buyIn,
    stack: d.cashOut,
    net: d.cashOut - d.buyIn,
    departed: true,
  }));
  return [...seated, ...gone].sort((a, b) => b.net - a.net);
}

/** Converts chip nets to cents so the total is exactly zero (largest remainder rounding). */
export function netsInCents(rows: LedgerRow[], price: number, startingStack: number): Map<string, number> {
  const out = new Map<string, number>();
  if (price <= 0 || startingStack <= 0) return out;
  const raw = rows.map((r) => ({ id: r.id, exact: (r.net * price) / startingStack }));
  const floored = raw.map((r) => ({ ...r, cents: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let drift = -floored.reduce((s, r) => s + r.cents, 0);
  const byRem = [...floored].sort((a, b) => b.rem - a.rem);
  for (const r of byRem) {
    if (drift <= 0) break;
    r.cents += 1;
    drift -= 1;
  }
  for (const r of floored) out.set(r.id, r.cents);
  return out;
}

/** Greedy largest-debtor to largest-creditor matching: at most n - 1 transfers. */
export function settleUp(nets: { id: string; net: number }[]): Transfer[] {
  const creditors = nets.filter((n) => n.net > 0).map((n) => ({ ...n }));
  const debtors = nets.filter((n) => n.net < 0).map((n) => ({ id: n.id, net: -n.net }));
  const transfers: Transfer[] = [];
  creditors.sort((a, b) => b.net - a.net);
  debtors.sort((a, b) => b.net - a.net);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].net, creditors[j].net);
    if (amount > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].net -= amount;
    creditors[j].net -= amount;
    if (debtors[i].net === 0) i += 1;
    if (creditors[j].net === 0) j += 1;
  }
  return transfers;
}
