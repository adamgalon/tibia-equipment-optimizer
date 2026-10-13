import { describe, expect, it } from 'vitest';
import { describeChanges, diffEntries } from './changes.ts';

const byId = (e: Record<string, unknown>) => String(e.id);
const byName = (e: Record<string, unknown>) => String(e.name);

describe('data change list', () => {
  const before = [
    { id: 1, name: 'Falcon Plate', armor: 18, resist: { physical: 12 }, rev: 10 },
    { id: 2, name: 'Old Helmet', armor: 5, rev: 3 },
    { id: 3, name: 'Typo Fixed', armor: 7, rev: 4 },
  ];
  const after = [
    { id: 1, name: 'Falcon Plate', armor: 19, resist: { physical: 12, fire: 5 }, rev: 11 },
    { id: 3, name: 'Typo Fixed', armor: 7, rev: 5 },
    { id: 4, name: 'Moonsilver Axe', attack: 6, rev: 1 },
  ];

  it('lists added, removed and changed entries, and counts revision-only edits', () => {
    expect(diffEntries(before, after, byId, byName)).toEqual({
      added: ['Moonsilver Axe'],
      removed: ['Old Helmet'],
      changed: [{ name: 'Falcon Plate', fields: ['armor 18 → 19', 'resist.fire — → 5'] }],
      editsOnly: 1,
    });
  });

  it('writes one section per file, skips files without changes, and caps long sections', () => {
    const changes = diffEntries(before, after, byId, byName);
    const none = diffEntries(before, before, byId, byName);
    expect(describeChanges([{ title: 'Items', changes }, { title: 'Creatures', changes: none }])).toBe(
      'Items: 1 added, 1 removed, 1 changed, 1 wiki edits without value changes\n+ Moonsilver Axe\n- Old Helmet\n~ Falcon Plate: armor 18 → 19; resist.fire — → 5',
    );
    const many = diffEntries([], Array.from({ length: 5 }, (_, i) => ({ name: `C${i}` })), byName);
    expect(describeChanges([{ title: 'Creatures', changes: many }], 2)).toBe('Creatures: 5 added, 0 removed, 0 changed, 0 wiki edits without value changes\n+ C0\n+ C1\n… and 3 more');
  });
});
