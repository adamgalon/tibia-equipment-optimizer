import { describe, expect, it } from 'vitest';
import { armorReduction, attackElements, bestProtection, blockedShare, damageTaken, incomingDamage, lootPerKill, perHour } from './hunt.ts';
import type { Creature, Item } from './types.ts';

const demon: Creature = { name: 'Demon', hp: 8200, damage: { physical: 500, fire: 250 }, takes: { fire: 0, holy: 112, ice: 112 }, rev: 1 };
const lord: Creature = { name: 'Dragon Lord', hp: 1900, damage: { physical: 230, fire: 440 }, takes: { fire: 0, ice: 110, earth: 20 }, rev: 1 };
const base = { type: 'Armors', vocations: [], level: 0, skills: {}, resist: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;

describe('hunt advisor', () => {
  it('takes the hardest hit per element across creatures, hardest first', () => {
    expect(incomingDamage([demon, lord])).toEqual([
      { element: 'physical', max: 500, from: 'Demon' },
      { element: 'fire', max: 440, from: 'Dragon Lord' },
    ]);
  });

  it('averages how much damage each element does to them, treating unlisted elements as 100%', () => {
    const [best, second] = attackElements([demon, lord]);
    expect(best).toEqual({ element: 'ice', takes: 111 });
    expect(second).toEqual({ element: 'holy', takes: 106 });
    expect(attackElements([demon, lord]).find((a) => a.element === 'earth')?.takes).toBe(60);
  });

  it('weighs each protection by how hard its element hits, and penalises weaknesses', () => {
    const incoming = incomingDamage([demon]); // physical 500, fire 250: weights 2/3 and 1/3
    const fireArmor: Item = { ...base, id: 1, name: 'Fire Armor', slot: 'body', resist: { fire: 15 } };
    const mixed: Item = { ...base, id: 2, name: 'Mixed', slot: 'body', resist: { physical: 9, fire: -3 } };
    expect(blockedShare(fireArmor, incoming)).toBeCloseTo(5);
    expect(blockedShare(mixed, incoming)).toBeCloseTo(5);
    expect(blockedShare(fireArmor, [])).toBe(0);
  });

  it('takes off armor from physical hits after protection, matching the wiki example', () => {
    // TibiaWiki "Formulae": a 200 hit against 5% and 6% items becomes 178, then armor 9 takes 4-7 off: 171-174.
    expect(armorReduction(9)).toBe(5.5);
    expect(armorReduction(1)).toBe(0);
    expect(damageTaken(200, 100 * (1 - 0.95 * 0.94), 'physical', 9)).toBe(173);
    expect(damageTaken(200, 10, 'fire', 9)).toBe(180);
    expect(damageTaken(3, 0, 'physical', 52)).toBe(0);
  });

  it('turns kills per hour into experience and loot per hour, spread evenly over the creatures', () => {
    const rich: Creature = { ...lord, exp: 2000, loot: { kills: 10, drops: [[1, 1, 1000]] } };
    const poor: Creature = { ...demon, exp: 6000 };
    expect(perHour([rich, poor], 100, (c) => lootPerKill(c))).toEqual({ exp: 400_000, loot: 50_000 });
    expect(perHour([rich], 0, () => 1)).toBeUndefined();
    expect(perHour([], 100, () => 1)).toBeUndefined();
  });

  it('values loot per kill at the better of NPC and market price', () => {
    // 50 gold coins, a quarter Demon Horn (NPC 1,000) and a tenth of an item NPCs pay 10 for.
    const looter: Creature = { ...demon, loot: { kills: 100, drops: [[3031, 50, 1], [5954, 0.25, 1000], [7, 0.1, 10]] } };
    expect(lootPerKill(looter)).toBe(301);
    expect(lootPerKill(looter, (id) => ({ 5954: 4000, 7: 5 })[id])).toBe(1051);
    expect(lootPerKill(demon)).toBeUndefined();
  });

  it('ranks the best items per slot and leaves out slots where nothing helps', () => {
    const incoming = incomingDamage([demon]);
    const a: Item = { ...base, id: 1, name: 'A', slot: 'body', resist: { fire: 15 } };
    const b: Item = { ...base, id: 2, name: 'B', slot: 'body', resist: { physical: 12 } };
    const c: Item = { ...base, id: 3, name: 'C', slot: 'body', resist: { ice: 20 } };
    const result = bestProtection({ body: [a, b, c], head: [c] } as never, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].slot).toBe('body');
    expect(result[0].picks.map((p) => p.item.name)).toEqual(['B', 'A']);
  });
});
