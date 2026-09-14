import { addPlayer, createGame, setStack, type Game, type Settings } from '../shared/engine';

export const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Seats p0..pn-1 in order. With 3+ players the first hand puts the button on p0, SB p1, BB p2. */
export function table(stacks: number[], settings: Partial<Settings> = {}): Game {
  let g = createGame({ sb: 5, bb: 10, startingStack: 1000, buyInPrice: 0, ...settings });
  stacks.forEach((stack, i) => {
    g = addPlayer(g, `p${i}`, `P${i}`);
    g = setStack(g, `p${i}`, stack);
  });
  return g;
}

export const stacks = (g: Game) => Object.fromEntries(g.players.map((p) => [p.id, p.stack]));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
