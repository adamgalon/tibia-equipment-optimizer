import { ELEMENTS, SLOTS } from './types.ts';
import type { Imbuement, Item, Slot } from './types.ts';
import { STAT_ROWS, maxTier } from './stats.ts';
import type { StatRow } from './stats.ts';

/** An item as worn: the forge tier and imbuements belong to the player's copy, not to the catalog. */
export interface Worn { item: Item; tier: number; imbuements: Imbuement[] }
/** What is worn in each slot; a missing key is an empty slot. */
export type Build = Partial<Record<Slot, Worn>>;
/** A build as stored in the browser: item IDs and imbuement names. */
export type StoredBuild = Partial<Record<Slot, { id: number; tier: number; imbuements: string[] }>>;

/** Forge effect per slot and its chance (%) at tiers 1-10 (TibiaWiki "Onslaught", "Ruse", "Momentum", "Transcendence", "Amplification"). */
export const FORGE_EFFECTS: Partial<Record<Slot, { key: string; chances: number[] }>> = {
  weapon: { key: 'onslaught', chances: [0.5, 1.05, 1.7, 2.45, 3.3, 4.25, 5.3, 6.45, 7.7, 9.05] },
  body: { key: 'ruse', chances: [0.5, 1.03, 1.62, 2.28, 3, 3.78, 4.62, 5.52, 6.48, 7.51] },
  head: { key: 'momentum', chances: [2, 4.05, 6.2, 8.45, 10.8, 13.25, 15.8, 18.45, 21.2, 24.05] },
  legs: { key: 'transcendence', chances: [0.13, 0.27, 0.44, 0.64, 0.86, 1.11, 1.38, 1.68, 2, 2.35] },
  // Boots raise the four chances above by this share.
  feet: { key: 'amplification', chances: [2.5, 5.4, 9.1, 13.6, 18.9, 25, 31.9, 39.6, 48.1, 57.4] },
};

// Stats that only imbuements and forge tiers give, so items never carry them.
const extraRow = (key: string, label: StatRow['label']): StatRow => ({ key, label, get: () => undefined, percent: true });
const IMBUEMENT_ROWS = [
  ...ELEMENTS.map((e) => extraRow(`convert.${e}`, (t) => `${t('convert')}: ${t(`el.${e}`)}`)),
  extraRow('paralysisDeflection', (t) => t('paralysisDeflection')),
];
const FORGE_ROWS = Object.entries(FORGE_EFFECTS).map(([slot, { key }]) => ({ slot: slot as Slot, row: extraRow(key, (t) => t(`forge.${key}`)) }));
export const ROW_BY_KEY = new Map([...STAT_ROWS, ...IMBUEMENT_ROWS].map((row) => [row.key, row]));

// Defense comes from the shield or the weapon, not a sum; a max tier is per item.
const NOT_SUMMED = new Set(['defense', 'defenseMod', 'maxTier']);
const SUMMED_ROWS = [...STAT_ROWS.filter((row) => row.missingIsZero && !NOT_SUMMED.has(row.key)), ...IMBUEMENT_ROWS];

/** Each item's protection applies after the previous one (TibiaWiki "Formulae", rev 1205374), so 10% + 10% = 19%. */
export function combineProtection(values: number[]): number {
  const left = values.reduce((rest, p) => rest * (1 - p / 100), 1);
  return Math.round((1 - left) * 1000) / 10;
}

/** Non-zero totals of the worn items and their imbuements, then the forge chances. */
export function buildTotals(build: Build): { row: StatRow; total: number }[] {
  const worn = Object.values(build).filter((w): w is Worn => !!w);
  const imbuements = worn.flatMap((w) => w.imbuements);
  const summed = SUMMED_ROWS.flatMap((row) => {
    const values = [...worn.map((w) => row.get(w.item) ?? 0), ...imbuements.map((i) => i.effects[row.key] ?? 0)];
    const total = row.key.startsWith('resist.') ? combineProtection(values) : values.reduce((s, v) => s + v, 0);
    return total ? [{ row, total }] : [];
  });
  // Amplification multiplies the other chances: tier 3 legs 0.44% become 0.48% with tier 3 boots (TibiaWiki "Amplification").
  const chance = (slot: Slot) => FORGE_EFFECTS[slot]?.chances[(build[slot]?.tier ?? 0) - 1] ?? 0;
  const amplify = 1 + chance('feet') / 100;
  const forge = FORGE_ROWS.flatMap(({ slot, row }) => {
    const total = Math.round(chance(slot) * (slot === 'feet' ? 1 : amplify) * 100) / 100;
    return total ? [{ row, total }] : [];
  });
  return [...summed, ...forge];
}

/** Two-handed weapons leave no hand free, except that a quiver fits next to a bow or crossbow (TibiaWiki "Quivers"). */
export const fitsTogether = (weapon: Item, offHand: Item) =>
  weapon.hands !== 2 || (offHand.type === 'Quivers' && weapon.type === 'Distance Weapons');

/** Puts an item into a slot at tier 0 without imbuements, or empties the slot when item is undefined. */
export function equip(build: Build, slot: Slot, item: Item | undefined): Build {
  const next: Build = { ...build, [slot]: item && { item, tier: 0, imbuements: [] } };
  // The newest pick wins, as in the game, where a two-handed weapon moves the shield to the backpack.
  const other = slot === 'weapon' ? 'shield' : slot === 'shield' ? 'weapon' : undefined;
  if (item && other && next.weapon && next.shield && !fitsTogether(next.weapon.item, next.shield.item)) delete next[other];
  return next;
}

/** Item kinds as the imbuement pages name them. */
const KINDS: Record<string, string[]> = {
  Armors: ['armors'], Shields: ['shields'], Spellbooks: ['spellbooks'], Helmets: ['helmets'], Boots: ['boots'],
  'Sword Weapons': ['swords'], 'Axe Weapons': ['axes'], 'Club Weapons': ['clubs'], 'Fist Fighting Weapons': ['fists'],
  Wands: ['wands'], Rods: ['rods'],
  // shortcut: bows and crossbows count as both, because the Vampirism pages leave out crossbows that the Imbuing page includes;
  // split them if a page ever lists only one of the two on purpose.
  'Distance Weapons': ['bows', 'crossbows'],
};
const kinds = (item: Item) => [...(KINDS[item.type] ?? []), ...(item.type === 'Helmets' ? item.vocations.map((v) => `helmets (${v})`) : [])];

// TibiaWiki "Imbuing": these boots take Swiftness despite their own speed.
const SWIFTNESS_EXCEPTIONS = new Set(['Pair of Soulwalkers', 'Pair of Soulstalkers']);
const converts = (i: Imbuement) => Object.keys(i.effects).some((key) => key.startsWith('convert.'));

/**
 * TibiaWiki "Imbuing": an item's own elemental damage, protection, skill or speed blocks the matching imbuement.
 * The page also bars Vampirism from weapons with their own life leech; that rule waits for an in-game check (docs/STATUS.md).
 */
function hasOwn(item: Item, key: string): boolean {
  if (key.startsWith('convert.')) return !!item.elementAttack;
  if (key === 'speed' && SWIFTNESS_EXCEPTIONS.has(item.name)) return false;
  return /^(resist\.|skill\.|speed$)/.test(key) && ROW_BY_KEY.get(key)?.get(item) !== undefined;
}

/** Whether an imbuement fits the item next to the others on it: one of each type, and one damage conversion at most. */
export function canImbue(item: Item, imbuement: Imbuement, others: Imbuement[]): boolean {
  return imbuement.fits.some((kind) => kinds(item).includes(kind)) &&
    !Object.keys(imbuement.effects).some((key) => hasOwn(item, key)) &&
    !others.some((o) => o.type === imbuement.type || (converts(o) && converts(imbuement)));
}

export const toStored = (build: Build): StoredBuild =>
  Object.fromEntries(Object.entries(build).flatMap(([slot, w]) =>
    (w ? [[slot, { id: w.item.id, tier: w.tier, imbuements: w.imbuements.map((i) => i.name) }]] : [])));

/**
 * Rebuilds a stored build, dropping whatever is unknown or no longer allowed (old data, edited storage).
 * Builds saved before forge tiers existed hold a bare item ID per slot.
 */
export function fromStored(stored: unknown, byId: Map<number, Item>, imbuementByName: Map<string, Imbuement>): Build {
  if (typeof stored !== 'object' || stored === null) return {};
  const build: Build = {};
  for (const slot of SLOTS) {
    const raw = (stored as Record<string, unknown>)[slot];
    const entry = (typeof raw === 'number' ? { id: raw } : raw ?? {}) as { id?: unknown; tier?: unknown; imbuements?: unknown };
    const item = byId.get(entry.id as number);
    if (item?.slot !== slot) continue;
    const tier = Math.min(Math.max(0, Math.trunc(Number(entry.tier) || 0)), maxTier(item));
    const imbuements: Imbuement[] = [];
    for (const name of Array.isArray(entry.imbuements) ? entry.imbuements : []) {
      const imbuement = imbuementByName.get(name);
      if (imbuement && imbuements.length < (item.imbueSlots ?? 0) && canImbue(item, imbuement, imbuements)) imbuements.push(imbuement);
    }
    build[slot] = { item, tier, imbuements };
  }
  return build;
}
