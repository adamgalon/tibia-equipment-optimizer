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
