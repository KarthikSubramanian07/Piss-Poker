const chips = new Intl.NumberFormat('en-US');
const cash = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const fmt = (n: number) => chips.format(n);
export const money = (cents: number) => cash.format(cents / 100);
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
export const signedMoney = (cents: number) =>
  cents > 0 ? `+${money(cents)}` : cents < 0 ? `−${money(-cents)}` : money(0);

export const STREET_NAMES = ['Preflop', 'Flop', 'Turn', 'River'] as const;
export const NEXT_CARDS = ['', 'Deal the flop', 'Deal the turn', 'Deal the river'] as const;

export const roomUrl = (code: string) => `${location.origin}/t/${code}`;
