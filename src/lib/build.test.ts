import { describe, expect, it } from 'vitest';
import { buildTotals, canImbue, combineProtection, equip, fromStored, toStored } from './build.ts';
import type { Build } from './build.ts';
import type { Imbuement, Item } from './types.ts';

const base = { type: 'Armors', vocations: [], level: 0, skills: {}, resist: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;
const helmet: Item = { ...base, id: 1, name: 'Helmet', slot: 'head', type: 'Helmets', armor: 8, skills: { magic: 2 }, resist: { fire: 10 }, upgradeClass: 4, imbueSlots: 2 };
const armor: Item = { ...base, id: 2, name: 'Armor', slot: 'body', armor: 15, defense: 3, resist: { fire: 10, ice: -5 }, imbueSlots: 2 };
const boots: Item = { ...base, id: 3, name: 'Boots', slot: 'feet', type: 'Boots', upgradeClass: 4 };
const worn = (item: Item, tier = 0, imbuements: Imbuement[] = []) => ({ item, tier, imbuements });
const imbuement = (name: string, type: string, effects: Imbuement['effects'], fits: string[]): Imbuement =>
  ({ name, type, level: 'Powerful', effects, fits, rev: 1 });
const lichShroud = imbuement('Powerful Lich Shroud', 'Lich Shroud', { 'resist.death': 10 }, ['armors', 'shields']);
const dragonHide = imbuement('Powerful Dragon Hide', 'Dragon Hide', { 'resist.fire': 15 }, ['armors', 'shields']);
const vampirism = imbuement('Powerful Vampirism', 'Vampirism', { lifeLeech: 25 }, ['armors', 'swords', 'bows']);
const scorch = imbuement('Powerful Scorch', 'Scorch', { 'convert.fire': 50 }, ['swords', 'bows', 'crossbows']);
const frost = imbuement('Powerful Frost', 'Frost', { 'convert.ice': 50 }, ['swords', 'bows', 'crossbows']);
const epiphany = imbuement('Powerful Epiphany', 'Epiphany', { 'skill.magic': 4 }, ['wands', 'helmets (sorcerer)']);

describe('build totals', () => {
  it('combines protections one after another instead of adding them', () => {
    expect(combineProtection([10, 10])).toBe(19);
    expect(combineProtection([80, 20])).toBe(84);
    expect(combineProtection([10, -5])).toBe(5.5);
  });

  it('adds armor and skills, combines protections, and skips defense', () => {
    const totals = Object.fromEntries(buildTotals({ head: worn(helmet), body: worn(armor) }).map(({ row, total }) => [row.key, total]));
    expect(totals).toEqual({ armor: 23, 'skill.magic': 2, 'resist.fire': 19, 'resist.ice': -5, imbueSlots: 4 });
  });

  it('counts imbuements as their own protection and bonus sources', () => {
    const totals = Object.fromEntries(buildTotals({ head: worn(helmet), body: worn(armor, 0, [lichShroud, vampirism]) }).map(({ row, total }) => [row.key, total]));
    expect(totals).toMatchObject({ 'resist.death': 10, 'resist.fire': 19, lifeLeech: 25 });
  });

  it('amplifies forge chances with the boots tier, matching the wiki example', () => {
    const totals = (build: Build) => Object.fromEntries(buildTotals(build).map(({ row, total }) => [row.key, total]));
    expect(totals({ head: worn(helmet, 5) })).toMatchObject({ momentum: 10.8 });
    // TibiaWiki "Amplification": helmet tier 5 10.80% -> 11.78% with tier 3 boots (+9.1%).
    expect(totals({ head: worn(helmet, 5), feet: worn(boots, 3) })).toMatchObject({ momentum: 11.78, amplification: 9.1 });
  });
});

describe('imbuement rules', () => {
  const bow: Item = { ...base, id: 20, name: 'Crossbow', slot: 'weapon', type: 'Distance Weapons', hands: 2, imbueSlots: 3 };
  const fireSword: Item = { ...base, id: 21, name: 'Fire Sword', slot: 'weapon', type: 'Sword Weapons', hands: 1, imbueSlots: 2, elementAttack: { element: 'fire', value: 11 } };
  const mageHat: Item = { ...helmet, id: 22, name: 'Mage Hat', skills: {}, vocations: ['sorcerer', 'druid'] };

  it('matches item kinds, including crossbows on pages that only say bows', () => {
    expect(canImbue(armor, lichShroud, [])).toBe(true);
    expect(canImbue(bow, vampirism, [])).toBe(true);
    expect(canImbue(helmet, lichShroud, [])).toBe(false);
    expect(canImbue(mageHat, epiphany, [])).toBe(true);
  });

  it("blocks an imbuement for a stat the item already has, a repeated type, and a second damage conversion", () => {
    expect(canImbue(armor, dragonHide, [])).toBe(false);
    expect(canImbue({ ...mageHat, skills: { magic: 2 } }, epiphany, [])).toBe(false);
    expect(canImbue(fireSword, frost, [])).toBe(false);
    expect(canImbue(bow, frost, [scorch])).toBe(false);
    expect(canImbue(armor, lichShroud, [lichShroud])).toBe(false);
    expect(canImbue(bow, vampirism, [scorch])).toBe(true);
  });

  it('allows Vampirism on a weapon with its own life leech until that is checked in the game', () => {
    const leechSword: Item = { ...base, id: 23, name: 'Leech Sword', slot: 'weapon', type: 'Sword Weapons', hands: 1, imbueSlots: 2, lifeLeech: 2 };
    expect(canImbue(leechSword, vampirism, [])).toBe(true);
  });
});

describe('two-handed weapons', () => {
  const sword: Item = { ...base, id: 10, name: 'Sword', slot: 'weapon', type: 'Sword Weapons', hands: 1 };
  const greatSword: Item = { ...sword, id: 11, name: 'Great Sword', hands: 2 };
  const bow: Item = { ...base, id: 12, name: 'Bow', slot: 'weapon', type: 'Distance Weapons', hands: 2 };
  const shield: Item = { ...base, id: 13, name: 'Shield', slot: 'shield', type: 'Shields' };
  const quiver: Item = { ...base, id: 14, name: 'Quiver', slot: 'shield', type: 'Quivers' };

  it('takes off the other hand when the newest pick does not fit with it', () => {
    expect(equip({ shield: worn(shield) }, 'weapon', greatSword)).toEqual({ weapon: worn(greatSword) });
    expect(equip({ weapon: worn(greatSword) }, 'shield', shield)).toEqual({ shield: worn(shield) });
  });

  it('keeps a shield with one-handed weapons and a quiver with bows only', () => {
    expect(equip({ shield: worn(shield) }, 'weapon', sword)).toEqual({ shield: worn(shield), weapon: worn(sword) });
    expect(equip({ shield: worn(quiver) }, 'weapon', bow)).toEqual({ shield: worn(quiver), weapon: worn(bow) });
    expect(equip({ shield: worn(quiver) }, 'weapon', greatSword)).toEqual({ weapon: worn(greatSword) });
    expect(equip({ weapon: worn(greatSword) }, 'shield', undefined)).toEqual({ weapon: worn(greatSword), shield: undefined });
  });
});

describe('stored builds', () => {
  const byId = new Map([helmet, armor, boots].map((i) => [i.id, i]));
  const byName = new Map([lichShroud, dragonHide, vampirism].map((i) => [i.name, i]));

  it('round-trips items, tiers and imbuements', () => {
    const build: Build = { head: worn(helmet, 7), body: worn(armor, 0, [lichShroud, vampirism]) };
    expect(fromStored(toStored(build), byId, byName)).toEqual(build);
  });

  it('reads bare item IDs from builds saved before forge tiers', () => {
    expect(fromStored({ head: 1 }, byId, byName)).toEqual({ head: worn(helmet) });
  });

  it('drops unknown or misplaced items, caps the tier and skips imbuements that do not fit', () => {
    expect(fromStored({ head: 2, body: 999, legs: 'x' }, byId, byName)).toEqual({});
    expect(fromStored('garbage', byId, byName)).toEqual({});
    expect(fromStored({ head: { id: 1, tier: 99 } }, byId, byName).head?.tier).toBe(10);
    const body = fromStored({ body: { id: 2, imbuements: ['Powerful Dragon Hide', 'Powerful Lich Shroud', 'Nope', 'Powerful Vampirism'] } }, byId, byName).body;
    expect(body?.imbuements).toEqual([lichShroud, vampirism]);
  });
});
