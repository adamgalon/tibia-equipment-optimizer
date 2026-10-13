import { describe, expect, it } from 'vitest';
import { formatGold, imbuementUpkeep, marketPrice, optimizeBuild, parseGold, upgradesPerGold } from './prices.ts';
import { incomingDamage } from './hunt.ts';
import type { Creature, Imbuement, Item } from './types.ts';

describe('gold', () => {
  it('reads prices the way players type them', () => {
    expect(parseGold('30kk')).toBe(30_000_000);
    expect(parseGold('1.5kk')).toBe(1_500_000);
    expect(parseGold('2,5 KK')).toBe(2_500_000);
    expect(parseGold('850k')).toBe(850_000);
    expect(parseGold('1,200,000')).toBe(1_200_000);
    expect(parseGold('1 200 000')).toBe(1_200_000);
    expect(parseGold('900')).toBe(900);
    expect(parseGold('')).toBeUndefined();
    expect(parseGold('lots')).toBeUndefined();
    expect(parseGold('0')).toBeUndefined();
  });

  it('writes the same shorthand back', () => {
    expect(formatGold(30_941_727)).toBe('30.9kk');
    expect(formatGold(4_100_000)).toBe('4.1kk');
    expect(formatGold(850_000)).toBe('850k');
    expect(formatGold(900)).toBe('900');
  });

  it('uses the average sale price, falls back to the sell offer, and ignores unknown or malformed entries', () => {
    expect(marketPrice({ id: 1, time: 100, month_average_sell: 30_000, sell_offer: 31_000 })).toEqual({ id: 1, price: { gold: 30_000, kind: 'sale', observed: 100_000 } });
    expect(marketPrice({ id: 2, time: 100, month_average_sell: -1, sell_offer: 5_000 })?.price.kind).toBe('offer');
    expect(marketPrice({ id: 3, time: 100, month_average_sell: -1, sell_offer: -1 })).toBeUndefined();
    expect(marketPrice({ id: '4', time: 100, month_average_sell: 5 })).toBeUndefined();
    expect(marketPrice(null)).toBeUndefined();
  });
});

describe('upgrades per gold', () => {
  const base = { type: 'Helmets', vocations: [], level: 0, skills: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;
  const demon: Creature = { name: 'Demon', damage: { physical: 500, fire: 500 }, takes: {}, rev: 1 };
  const worn: Item = { ...base, id: 1, name: 'Worn', slot: 'head', resist: { fire: 2 } };
  const cheap: Item = { ...base, id: 2, name: 'Cheap', slot: 'head', resist: { fire: 4 } };
  const pricey: Item = { ...base, id: 3, name: 'Pricey', slot: 'head', resist: { fire: 10 } };
  const worse: Item = { ...base, id: 4, name: 'Worse', slot: 'head', resist: { fire: 1 } };
  const unpriced: Item = { ...base, id: 5, name: 'Unpriced', slot: 'head', resist: { fire: 20 } };
  const charged: Item = { ...base, id: 6, name: 'Charged', slot: 'head', resist: { fire: 80 }, charges: 5 };
  const gold: Record<number, number> = { 2: 10_000, 3: 1_000_000, 4: 1, 6: 100 };
  const incoming = incomingDamage([demon]);
  const rank = (budget?: number) => upgradesPerGold({ head: [worn, cheap, pricey, worse, unpriced, charged] } as never, incoming, () => worn, (i) => gold[i.id], budget);

  it('ranks gains over the worn item by gain per gold, skipping unpriced, worse and charged items', () => {
    expect(rank().map((u) => [u.item.name, u.gain])).toEqual([['Cheap', 1], ['Pricey', 4]]);
  });

  it('leaves out upgrades above the budget', () => {
    expect(rank(50_000).map((u) => u.item.name)).toEqual(['Cheap']);
  });

  it('never suggests a weapon swap for protection', () => {
    const shieldSword: Item = { ...base, id: 7, name: 'Fire Sword', slot: 'weapon', type: 'Sword Weapons', resist: { fire: 10 } };
    expect(upgradesPerGold({ weapon: [shieldSword] } as never, incoming, () => undefined, () => 1)).toEqual([]);
  });
});

describe('imbuing costs', () => {
  const hide: Imbuement = { name: 'Powerful Dragon Hide', type: 'Dragon Hide', level: 'Powerful', effects: {}, fits: [], sources: [[1, 20], [2, 10], [3, 5]], rev: 1 };
  it('spreads the fee and priced materials over 20 hours and counts unpriced materials', () => {
    // 250,000 fee + 20 x 1,000 + 10 x 2,000 = 290,000 over 20 hours; material 3 has no price.
    expect(imbuementUpkeep([hide], (id) => ({ 1: 1000, 2: 2000 })[id])).toEqual({ perHour: 14_500, unpriced: 1 });
    expect(imbuementUpkeep([], () => 1)).toEqual({ perHour: 0, unpriced: 0 });
  });
});

describe('optimize for a hunt', () => {
  const base = { vocations: [], level: 0, skills: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;
  const demon: Creature = { name: 'Demon', damage: { fire: 500 }, takes: {}, rev: 1 };
  const incoming = incomingDamage([demon]);
  const helmet = (id: number, fire: number, extra: Partial<Item> = {}): Item => ({ ...base, id, name: `H${id}`, slot: 'head', type: 'Helmets', resist: { fire }, ...extra });
  const worn = helmet(1, 2);
  const cheap = helmet(2, 4);
  const best = helmet(3, 10);
  const charged = helmet(4, 80, { charges: 5 });
  const gold: Record<number, number> = { 2: 10_000, 3: 1_000_000, 4: 1 };
  const options = { head: [worn, cheap, best, charged] } as never;

  it('picks the most protection per slot without a budget, skipping charged items', () => {
    expect(optimizeBuild(options, incoming, { head: worn }, (i) => gold[i.id])).toEqual({ head: best });
  });

  it('stays within a budget and keeps a worn item that is already best', () => {
    expect(optimizeBuild(options, incoming, { head: worn }, (i) => gold[i.id], 50_000)).toEqual({ head: cheap });
    expect(optimizeBuild(options, incoming, { head: best }, (i) => gold[i.id])).toEqual({});
  });

  it('never picks a shield that does not fit a two-handed weapon', () => {
    const greatSword: Item = { ...base, id: 9, name: 'Great Sword', slot: 'weapon', type: 'Sword Weapons', hands: 2, resist: {} };
    const shield: Item = { ...base, id: 8, name: 'Shield', slot: 'shield', type: 'Shields', resist: { fire: 20 } };
    expect(optimizeBuild({ shield: [shield] } as never, incoming, { weapon: greatSword }, () => 1)).toEqual({});
  });
});
