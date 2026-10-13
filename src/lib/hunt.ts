import { ATTACK_ELEMENTS } from './types.ts';
import type { Creature, Element, Item, Slot } from './types.ts';

export interface Incoming { element: Element; max: number; from: string }

/** Per element, the hardest hit among the creatures and who deals it, hardest first. */
export function incomingDamage(creatures: Creature[]): Incoming[] {
  const worst = new Map<Element, Incoming>();
  for (const creature of creatures) {
    for (const [element, max] of Object.entries(creature.damage) as [Element, number][]) {
      if (max > (worst.get(element)?.max ?? 0)) worst.set(element, { element, max, from: creature.name });
    }
  }
  return [...worst.values()].sort((a, b) => b.max - a.max);
}

/** Average damage the creatures take from each attack element in % (100 is normal), most first. */
export function attackElements(creatures: Creature[]): { element: Element; takes: number }[] {
  return ATTACK_ELEMENTS
    .map((element) => ({ element, takes: Math.round(creatures.reduce((sum, c) => sum + (c.takes[element] ?? 100), 0) / creatures.length) }))
    .sort((a, b) => b.takes - a.takes);
}

/** Average physical damage armor absorbs from one hit: TibiaWiki "Formulae" draws it from floor(t/2) to floor(t/2)*2-1, never below 0. */
export function armorReduction(armor: number): number {
  const min = Math.floor(armor / 2);
  const max = min * 2 - 1;
  return max <= 0 ? 0 : (min + max) / 2;
}

/** Damage left of a hit after the build's protection and, for physical hits, its armor (applied after protection, as the wiki's example does). */
export const damageTaken = (hit: number, protection: number, element: Element, armor: number) =>
  Math.max(0, Math.round(Math.floor(hit * (1 - protection / 100)) - (element === 'physical' ? armorReduction(armor) : 0)));

/**
 * Experience and loot per hour at a kill rate spread evenly over the creatures. Experience per kill comes from expOf
 * (the wiki's base value unless bonuses are applied); creatures without loot statistics add no loot.
 */
export function perHour(creatures: Creature[], killsPerHour: number, lootOf: (c: Creature) => number | undefined, expOf = (c: Creature) => c.exp ?? 0) {
  if (!creatures.length || !(killsPerHour > 0)) return undefined;
  const average = (value: (c: Creature) => number) => (creatures.reduce((sum, c) => sum + value(c), 0) / creatures.length) * killsPerHour;
  return { exp: Math.round(average(expOf)), loot: Math.round(average((c) => lootOf(c) ?? 0)) };
}

/**
 * Experience multiplier from hunt-wide bonuses (TibiaWiki "Experience Point", "XP Boost"): event and XP Boost bonuses add up,
 * and the premium stamina bonus multiplies the result. Prey and boosted creature apply per creature, on top of this.
 */
export const expMultiplier = (b: { stamina?: boolean; xpBoost?: boolean; doubleXp?: boolean }) =>
  (1 + (b.xpBoost ? 0.5 : 0) + (b.doubleXp ? 1 : 0)) * (b.stamina ? 1.5 : 1);

/** Average loot value per kill: each drop at the better of its NPC value and its price (market or the player's own). */
export function lootPerKill(creature: Creature, priceOf: (id: number) => number | undefined = () => undefined): number | undefined {
  if (!creature.loot) return undefined;
  return Math.round(creature.loot.drops.reduce((sum, [id, perKill, npc]) => sum + perKill * Math.max(npc, priceOf(id) ?? 0), 0));
}

/** Share (%) of the incoming damage an item blocks on its own: each protection weighted by how hard its element hits. */
export function blockedShare(item: Item, incoming: Incoming[]): number {
  const total = incoming.reduce((sum, d) => sum + d.max, 0);
  return total ? incoming.reduce((sum, d) => sum + (d.max / total) * (item.resist[d.element] ?? 0), 0) : 0;
}

/** The items of each slot that block the most of the incoming damage; slots where nothing helps are left out. */
export function bestProtection(options: Record<Slot, Item[]>, incoming: Incoming[], limit = 3) {
  return (Object.entries(options) as [Slot, Item[]][]).flatMap(([slot, items]) => {
    const picks = items
      .map((item) => ({ item, blocks: blockedShare(item, incoming) }))
      .filter((pick) => pick.blocks > 0)
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, limit);
    return picks.length ? [{ slot, picks }] : [];
  });
}
