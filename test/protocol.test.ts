import { describe, expect, it } from 'vitest';
import { cleanName, sameName } from '../shared/names';
import { isRoomCode, normalizeCode, parseClientMessage } from '../shared/protocol';

const token = 'a'.repeat(64);
const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));

describe('parseClientMessage', () => {
  it('accepts well formed messages and keeps seq', () => {
    expect(parse({ type: 'hello', token, seq: 1 })).toEqual({ type: 'hello', token, seq: 1 });
    expect(parse({ type: 'act', v: 3, kind: 'raise', amount: 60 })).toEqual({ type: 'act', v: 3, kind: 'raise', amount: 60 });
    expect(parse({ type: 'act', v: 3, kind: 'fold', playerId: 'abcdef0123456789' })).toMatchObject({ playerId: 'abcdef0123456789' });
    expect(parse({ type: 'award', v: 9, winners: { 0: ['abcdef01', 'abcdef02'] } })).toEqual({
      type: 'award',
      v: 9,
      winners: { 0: ['abcdef01', 'abcdef02'] },
    });
    expect(parse({ type: 'settings', v: 1, settings: { sb: 5, bb: 10, startingStack: 1000, buyInPrice: 2000 } })).toBeTruthy();
  });

  it('rejects malformed input', () => {
    const bad = [
      'not json',
      { type: 'nope' },
      { type: 'hello', token: 'short' },
      { type: 'hello', token: 'Z'.repeat(64) },
      { type: 'act', v: 1, kind: 'allin' },
      { type: 'act', v: 1, kind: 'raise' },
      { type: 'act', v: -1, kind: 'check' },
      { type: 'act', v: 1, kind: 'raise', amount: 1.5 },
      { type: 'act', v: 1, kind: 'check', playerId: '<script>' },
      { type: 'award', v: 1, winners: { x: ['abcdef01'] } },
      { type: 'award', v: 1, winners: [] },
      { type: 'settings', v: 1, settings: { sb: '5', bb: 10, startingStack: 1000, buyInPrice: 0 } },
      { type: 'seatOrder', v: 1, ids: Array.from({ length: 11 }, (_, i) => `abcdefg${i}`) },
      { type: 'join', name: 42 },
      { type: 'start', seq: 'x', v: 1 },
      [1, 2, 3],
      null,
    ];
    for (const m of bad) {
      expect(typeof m === 'string' ? parseClientMessage(m) : parse(m)).toBeNull();
    }
  });
});

describe('room codes', () => {
  it('validates and normalizes', () => {
    expect(isRoomCode('ABCD')).toBe(true);
    expect(isRoomCode('ABCI')).toBe(false);
    expect(isRoomCode('abcd')).toBe(false);
    expect(normalizeCode(' ab-cd9e ')).toBe('ABCD');
  });
});

describe('cleanName', () => {
  it('strips control, bidi and zero width characters and collapses spaces', () => {
    expect(cleanName('  Sam​‮  Lee\n ')).toBe('Sam Lee');
    expect(cleanName('<script>alert(1)</script>')).toBe('<script>alert(1)');
  });

  it('normalizes compatibility forms and caps at 16 graphemes', () => {
    expect(cleanName('Ｓａｍ')).toBe('Sam');
    expect(cleanName('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
    expect(cleanName('👩‍👩‍👧‍👦'.repeat(20))).toBe('👩‍👩‍👧‍👦'.repeat(2));
  });

  it('rejects empty or non string names', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('​')).toBeNull();
    expect(cleanName('‍‍')).toBeNull();
    expect(cleanName(12)).toBeNull();
  });

  it('compares names case and accent insensitively', () => {
    expect(sameName('José', 'jose')).toBe(true);
    expect(sameName('Sam', 'Sammy')).toBe(false);
  });
});
