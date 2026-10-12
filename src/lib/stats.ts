import { ELEMENTS, SKILLS } from './types.ts';
import type { Element, Item } from './types.ts';

export type Translate = (key: string) => string;

export interface StatRow {
  key: string;
  label: (t: Translate) => string;
  get: (item: Item) => number | undefined;
  lowerIsBetter?: boolean;
  /** Bonuses: an item without the stat counts as 0 when ranking. */
  missingIsZero?: boolean;
  percent?: boolean;
}

/** Forge classification -> highest reachable tier. */
const MAX_TIER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 10 };

const simple = (key: string, get: StatRow['get'], extra: Partial<StatRow> = {}): StatRow =>
  ({ key, label: (t) => t(key), get, ...extra });

const perElement = (prefix: string, labelKey: string, get: (item: Item, e: Element) => number | undefined, extra: Partial<StatRow> = {}) =>
  ELEMENTS.map((e): StatRow => ({ key: `${prefix}.${e}`, label: (t) => `${t(labelKey)}: ${t(`el.${e}`)}`, get: (i) => get(i, e), ...extra }));

export const STAT_ROWS: StatRow[] = [
  simple('level', (i) => i.level, { lowerIsBetter: true }),
  simple('armor', (i) => i.armor, { missingIsZero: true }),
  simple('defense', (i) => i.defense, { missingIsZero: true }),
  simple('defenseMod', (i) => i.defenseMod, { missingIsZero: true }),
  simple('attack', (i) => i.attack),
  ...perElement('elementAttack', 'elementAttack', (i, e) => (i.elementAttack?.element === e ? i.elementAttack.value : undefined)),
  ...perElement('damage', 'damage', (i, e) => (i.damage?.element === e ? (i.damage.min + i.damage.max) / 2 : undefined)),
  simple('atkMod', (i) => i.atkMod),
  simple('hitMod', (i) => i.hitMod, { percent: true }),
  simple('range', (i) => i.range),
  simple('manaCost', (i) => i.manaCost, { lowerIsBetter: true }),
  ...SKILLS.map((s) => simple(`skill.${s}`, (i) => i.skills[s], { missingIsZero: true })),
  ...perElement('resist', 'protection', (i, e) => i.resist[e], { missingIsZero: true, percent: true }),
  simple('speed', (i) => i.speed, { missingIsZero: true }),
  simple('critChance', (i) => i.critChance, { missingIsZero: true, percent: true }),
  simple('critExtra', (i) => i.critExtra, { missingIsZero: true, percent: true }),
  simple('lifeLeech', (i) => i.lifeLeech, { missingIsZero: true, percent: true }),
  simple('manaLeech', (i) => i.manaLeech, { missingIsZero: true, percent: true }),
  simple('damageReflection', (i) => i.damageReflection, { missingIsZero: true }),
  simple('imbueSlots', (i) => i.imbueSlots, { missingIsZero: true }),
  simple('maxTier', (i) => (i.upgradeClass ? MAX_TIER[i.upgradeClass] : undefined), { missingIsZero: true }),
  simple('mantra', (i) => i.mantra, { missingIsZero: true }),
];

/** Rows where at least one of the items has a value. */
export function visibleRows(items: Item[]): StatRow[] {
  return STAT_ROWS.filter((row) => items.some((i) => row.get(i) !== undefined));
}

/** Column indexes holding the best value of a row; empty when nothing differs or there is nothing to compare. */
export function bestIndexes(row: StatRow, items: Item[]): Set<number> {
  const values = items.map((i) => row.get(i) ?? (row.missingIsZero ? 0 : undefined));
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length < 2) return new Set();
  const best = row.lowerIsBetter ? Math.min(...defined) : Math.max(...defined);
  if (defined.every((v) => v === best)) return new Set();
  return new Set(values.flatMap((v, idx) => (v === best ? [idx] : [])));
}

export function formatValue(row: StatRow, value: number | undefined): string {
  if (value === undefined) return '—';
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return row.percent ? `${shown}%` : shown;
}

/** Signed difference to the first compared item, e.g. "+3" or "-2%"; empty when equal or not comparable. */
export function formatDelta(row: StatRow, value: number | undefined, base: number | undefined): string {
  const a = value ?? (row.missingIsZero ? 0 : undefined);
  const b = base ?? (row.missingIsZero ? 0 : undefined);
  if (a === undefined || b === undefined || a === b) return '';
  const diff = a - b;
  const shown = Number.isInteger(diff) ? String(diff) : diff.toFixed(1);
  return `${diff > 0 ? '+' : ''}${shown}${row.percent ? '%' : ''}`;
}
