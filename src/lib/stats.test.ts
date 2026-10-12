import { describe, expect, it } from 'vitest';
import { STAT_ROWS, bestIndexes, formatDelta, visibleRows } from './stats.ts';
import type { Item } from './types.ts';

const base = { type: 'Armors', vocations: [], skills: {}, resist: {}, wiki: 'x', rev: 1 } satisfies Partial<Item>;
const a: Item = { ...base, id: 1, name: 'A', slot: 'body', level: 100, armor: 12, resist: { fire: 10 } };
const b: Item = { ...base, id: 2, name: 'B', slot: 'body', level: 200, armor: 15, resist: { fire: 10, ice: 5 } };
const row = (key: string) => STAT_ROWS.find((r) => r.key === key)!;

describe('comparison rules', () => {
  it('highlights the higher value, or the lower one for requirements', () => {
    expect(bestIndexes(row('armor'), [a, b])).toEqual(new Set([1]));
    expect(bestIndexes(row('level'), [a, b])).toEqual(new Set([0]));
  });

  it('treats a missing bonus as zero, and highlights nothing when all values tie', () => {
    expect(bestIndexes(row('resist.ice'), [a, b])).toEqual(new Set([1]));
    expect(bestIndexes(row('resist.fire'), [a, b])).toEqual(new Set());
  });

  it('only shows rows that at least one item has', () => {
    const keys = visibleRows([a, b]).map((r) => r.key);
    expect(keys).toEqual(['level', 'armor', 'resist.fire', 'resist.ice']);
  });

  it('formats signed differences against the first item', () => {
    expect(formatDelta(row('armor'), 15, 12)).toBe('+3');
    expect(formatDelta(row('resist.ice'), undefined, 5)).toBe('-5%');
    expect(formatDelta(row('armor'), 12, 12)).toBe('');
  });
});
