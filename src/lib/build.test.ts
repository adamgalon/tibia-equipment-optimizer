import { describe, expect, it } from 'vitest';
import { buildTotals, combineProtection, equip, fromIds, toIds } from './build.ts';
import type { Item } from './types.ts';

const base = { type: 'Armors', vocations: [], level: 0, skills: {}, resist: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;
const helmet: Item = { ...base, id: 1, name: 'Helmet', slot: 'head', armor: 8, skills: { magic: 2 }, resist: { fire: 10 } };
const armor: Item = { ...base, id: 2, name: 'Armor', slot: 'body', armor: 15, defense: 3, resist: { fire: 10, ice: -5 } };

describe('build totals', () => {
  it('combines protections one after another instead of adding them', () => {
    expect(combineProtection([10, 10])).toBe(19);
    expect(combineProtection([80, 20])).toBe(84);
    expect(combineProtection([10, -5])).toBe(5.5);
  });

  it('adds armor and skills, combines protections, and skips defense', () => {
    const totals = Object.fromEntries(buildTotals({ head: helmet, body: armor }).map(({ row, total }) => [row.key, total]));
    expect(totals).toEqual({ armor: 23, 'skill.magic': 2, 'resist.fire': 19, 'resist.ice': -5 });
  });
});

describe('two-handed weapons', () => {
  const sword: Item = { ...base, id: 10, name: 'Sword', slot: 'weapon', type: 'Sword Weapons', hands: 1 };
  const greatSword: Item = { ...sword, id: 11, name: 'Great Sword', hands: 2 };
  const bow: Item = { ...base, id: 12, name: 'Bow', slot: 'weapon', type: 'Distance Weapons', hands: 2 };
  const shield: Item = { ...base, id: 13, name: 'Shield', slot: 'shield', type: 'Shields' };
  const quiver: Item = { ...base, id: 14, name: 'Quiver', slot: 'shield', type: 'Quivers' };

  it('takes off the other hand when the newest pick does not fit with it', () => {
    expect(equip({ shield }, 'weapon', greatSword)).toEqual({ weapon: greatSword });
    expect(equip({ weapon: greatSword }, 'shield', shield)).toEqual({ shield });
  });

  it('keeps a shield with one-handed weapons and a quiver with bows only', () => {
    expect(equip({ shield }, 'weapon', sword)).toEqual({ shield, weapon: sword });
    expect(equip({ shield: quiver }, 'weapon', bow)).toEqual({ shield: quiver, weapon: bow });
    expect(equip({ shield: quiver }, 'weapon', greatSword)).toEqual({ weapon: greatSword });
    expect(equip({ weapon: greatSword, shield: undefined }, 'shield', undefined)).toEqual({ weapon: greatSword, shield: undefined });
  });
});

describe('stored builds', () => {
  it('round-trips through item IDs and drops unknown or misplaced items', () => {
    const byId = new Map([helmet, armor].map((i) => [i.id, i]));
    expect(fromIds(toIds({ head: helmet, body: armor }), byId)).toEqual({ head: helmet, body: armor });
    expect(fromIds({ head: 2, body: 999, legs: 'x' }, byId)).toEqual({});
    expect(fromIds('garbage', byId)).toEqual({});
  });
});
