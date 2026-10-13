import { blockedShare } from './hunt.ts';
import type { Incoming } from './hunt.ts';
import type { Item, Slot } from './types.ts';

/** A price in gold: a Tibia Market quote, or one the player typed in. */
export interface Price { gold: number; kind: 'sale' | 'offer' | 'yours'; /** Unix ms when the market saw it. */ observed?: number }

/**
 * One Tibia Market `market_values` entry as a price: the 30-day average sale price, else the cheapest sell offer.
 * The API marks unknown numbers as -1; anything malformed counts as no price, since this is third-party data.
 */
export function marketPrice(value: unknown): { id: number; price: Price } | undefined {
  const v = value as Record<string, unknown> | null;
  if (typeof v?.id !== 'number' || typeof v.time !== 'number') return undefined;
  const observed = v.time * 1000;
  if (typeof v.month_average_sell === 'number' && v.month_average_sell > 0) return { id: v.id, price: { gold: v.month_average_sell, kind: 'sale', observed } };
  if (typeof v.sell_offer === 'number' && v.sell_offer > 0) return { id: v.id, price: { gold: v.sell_offer, kind: 'offer', observed } };
  return undefined;
}

/** Reads gold as players write it: "30kk" = 30,000,000, "1.5kk", "850k", "1,200,000" or "1 200 000". */
export function parseGold(text: string): number | undefined {
  const match = /^(\d+(?:[.,]\d+)?)\s*(kk|k)?$/i.exec(text.trim().replace(/[\s_]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, ''));
  if (!match) return undefined;
  const gold = Number(match[1].replace(',', '.')) * ({ kk: 1e6, k: 1e3 }[match[2]?.toLowerCase() ?? ''] ?? 1);
  return gold > 0 ? Math.round(gold) : undefined;
}

/** "30.9kk", "850k", "900": Tibia's own shorthand, read the same way in English and Polish. */
export function formatGold(gold: number): string {
  const short = (n: number, unit: string) => `${Number(n.toFixed(n < 10 ? 2 : 1))}${unit}`;
  if (gold >= 1e6) return short(gold / 1e6, 'kk');
  if (gold >= 1e3) return short(gold / 1e3, 'k');
  return String(gold);
}

/**
 * Items that block more of the hunt's damage than what is worn in their slot and cost at most the budget,
 * ranked by extra blocked share per gold. Only protection counts: armor, skills and other stats do not.
 */
export function upgradesPerGold(options: Record<Slot, Item[]>, incoming: Incoming[], worn: (slot: Slot) => Item | undefined,
  priceOf: (item: Item) => number | undefined, budget = Infinity, limit = 5) {
  return (Object.entries(options) as [Slot, Item[]][]).flatMap(([slot, items]) => {
    // Weapons and ammunition are chosen for damage; swapping them for a little protection is no upgrade.
    if (slot === 'weapon' || slot === 'ammo') return [];
    const current = worn(slot);
    const base = current ? blockedShare(current, incoming) : 0;
    return items.flatMap((item) => {
      // Charged items break after a few hits: they are supplies, not upgrades.
      if (item.charges || item === current) return [];
      const gain = blockedShare(item, incoming) - base;
      const gold = priceOf(item);
      return gain > 0 && gold && gold <= budget ? [{ slot, item, gain, gold }] : [];
    });
  }).sort((a, b) => b.gain / b.gold - a.gain / a.gold).slice(0, limit);
}
