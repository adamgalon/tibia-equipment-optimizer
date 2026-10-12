import { SLOTS } from './types.ts';
import type { Item, Slot } from './types.ts';
import { STAT_ROWS } from './stats.ts';
import type { StatRow } from './stats.ts';

/** The item worn in each slot; a missing key is an empty slot. */
export type Build = Partial<Record<Slot, Item>>;
/** A build as stored in the browser: slot -> item ID. */
export type BuildIds = Partial<Record<Slot, number>>;

// Defense comes from the shield or the weapon, not a sum; a max tier is per item.
const NOT_SUMMED = new Set(['defense', 'defenseMod', 'maxTier']);

/** Each item's protection applies after the previous one (TibiaWiki "Formulae", rev 1205374), so 10% + 10% = 19%. */
export function combineProtection(values: number[]): number {
  const left = values.reduce((rest, p) => rest * (1 - p / 100), 1);
  return Math.round((1 - left) * 1000) / 10;
}

/** Non-zero totals of the bonus rows for the worn items. */
export function buildTotals(build: Build): { row: StatRow; total: number }[] {
  const worn = Object.values(build).filter((i): i is Item => !!i);
  return STAT_ROWS.filter((row) => row.missingIsZero && !NOT_SUMMED.has(row.key)).flatMap((row) => {
    const values = worn.map((i) => row.get(i) ?? 0);
    const total = row.key.startsWith('resist.') ? combineProtection(values) : values.reduce((s, v) => s + v, 0);
    return total ? [{ row, total }] : [];
  });
}

/** Two-handed weapons leave no hand free, except that a quiver fits next to a bow or crossbow (TibiaWiki "Quivers"). */
export const fitsTogether = (weapon: Item, offHand: Item) =>
  weapon.hands !== 2 || (offHand.type === 'Quivers' && weapon.type === 'Distance Weapons');

/** Puts an item into a slot, or empties the slot when item is undefined. */
export function equip(build: Build, slot: Slot, item: Item | undefined): Build {
  const next: Build = { ...build, [slot]: item };
  // The newest pick wins, as in the game, where a two-handed weapon moves the shield to the backpack.
  const other = slot === 'weapon' ? 'shield' : slot === 'shield' ? 'weapon' : undefined;
  if (item && other && next.weapon && next.shield && !fitsTogether(next.weapon, next.shield)) delete next[other];
  return next;
}

export const toIds = (build: Build): BuildIds =>
  Object.fromEntries(Object.entries(build).flatMap(([slot, item]) => (item ? [[slot, item.id]] : [])));

/** Rebuilds a stored build, dropping anything that is not a known item in its own slot (old data, edited storage). */
export function fromIds(ids: unknown, byId: Map<number, Item>): Build {
  if (typeof ids !== 'object' || ids === null) return {};
  const build: Build = {};
  for (const slot of SLOTS) {
    const item = byId.get((ids as Record<string, unknown>)[slot] as number);
    if (item?.slot === slot) build[slot] = item;
  }
  return build;
}
