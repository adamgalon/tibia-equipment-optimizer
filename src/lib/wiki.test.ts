import { describe, expect, it } from 'vitest';
import { parseAttributes, parseInfobox, parseResist, parseVocations, toImbuement, toItem } from './wiki.ts';

const page = (fields: string) => `{{Infobox Object|List={{{1|}}}|GetValue={{{GetValue|}}}\n${fields}\n}}\nSome article text.`;
const item = (fields: string, title = 'Test') => toItem(parseInfobox(page(fields))!, { title, rev: 1 });

describe('parseInfobox', () => {
  it('reads fields, strips links and ignores empty values', () => {
    const f = parseInfobox(page('| name = Falcon Plate\n| droppedby = {{Dropped By|Grand Master Oberon}}\n| notes = See [[Falcon Set|the set]].\n| bestloot ='))!;
    expect(f.name).toBe('Falcon Plate');
    expect(f.notes).toBe('See the set.');
    expect(f).not.toHaveProperty('bestloot');
  });

  it('returns null for pages without an object infobox', () => {
    expect(parseInfobox('{{Infobox Creature\n| name = Hellspawn\n}}')).toBeNull();
  });
});

describe('field parsers', () => {
  it('parses vocations, including multi-vocation and "no restriction" values', () => {
    expect(parseVocations('knights and paladins')).toEqual(['knight', 'paladin']);
    expect(parseVocations('knights, paladins and monks')).toEqual(['knight', 'paladin', 'monk']);
    expect(parseVocations('sorcerer')).toEqual(['sorcerer']);
    expect(parseVocations('without')).toEqual([]);
    expect(parseVocations(undefined)).toEqual([]);
  });

  it('parses resistances, including two-word elements', () => {
    expect(parseResist('physical +12%, earth -2%, life drain +5%')).toEqual({ physical: 12, earth: -2, lifedrain: 5 });
  });

  it('splits attributes into skills, bonuses and unmodelled text', () => {
    const a = parseAttributes('sword fighting +4, magic level +1, holy magic level +2, speed +10, 19 damage reflection, faster regeneration');
    expect(a.skills).toEqual({ sword: 4, magic: 1, holyMagic: 2 });
    expect(a.speed).toBe(10);
    expect(a.damageReflection).toBe(19);
    expect(a.other).toEqual(['faster regeneration']);
  });
});

describe('toItem', () => {
  it('builds a body armor', () => {
    expect(item('| name = Falcon Plate\n| itemid = 28719\n| primarytype = Armors\n| slot = Body\n| levelrequired = 300\n| vocrequired = knights\n| imbueslots = 2\n| upgradeclass = 4\n| attrib = shielding +4\n| armor = 18\n| resist = physical +12%', 'Falcon Plate')).toEqual({
      id: 28719, name: 'Falcon Plate', slot: 'body', type: 'Armors', level: 300, vocations: ['knight'],
      armor: 18, skills: { shielding: 4 }, resist: { physical: 12 }, imbueSlots: 2, upgradeClass: 4, wiki: 'Falcon Plate', rev: 1,
    });
  });

  it('builds a wand with an elemental damage range', () => {
    const wand = item('| name = Wand of Everblazing\n| itemid = 16115\n| primarytype = Wands\n| slot = Weapon Hand\n| levelrequired = 65\n| vocrequired = sorcerers\n| range = 4\n| manacost = 17\n| damagetype = Fire\n| damagerange = 85 (75-95)')!;
    expect(wand.damage).toEqual({ element: 'fire', min: 75, max: 95 });
    expect(wand).toMatchObject({ slot: 'weapon', hands: 1, manaCost: 17, range: 4 });
  });

  it('builds a two-handed weapon with an elemental attack', () => {
    const sword = item('| name = Soulshredder\n| itemid = 34083\n| primarytype = Sword Weapons\n| slot = Both Hands\n| hands = Two\n| attack = 10\n| ice_attack = 47\n| defense = 35\n| attrib = sword fighting +4')!;
    expect(sword).toMatchObject({ hands: 2, attack: 10, defense: 35, elementAttack: { element: 'ice', value: 47 }, skills: { sword: 4 } });
  });

  it('builds a monk weapon and keeps the first of several item IDs', () => {
    expect(item('| name = Amber Kusarigama\n| itemid = 50239\n| primarytype = Fist Fighting Weapons\n| vocrequired = monks\n| hands = Two\n| attack = 44\n| attrib = fist fighting +4, magic level +1')).toMatchObject({
      id: 50239, vocations: ['monk'], skills: { fist: 4, magic: 1 },
    });
    expect(item('| name = Ring of Blue Plasma\n| itemid = 23529, 23530\n| primarytype = Rings')!.id).toBe(23529);
  });

  it('splits spell augments and keeps the item status', () => {
    const legs = item("| name = Sanguine Boots\n| itemid = 43885\n| primarytype = Boots\n| status = unavailable\n| augments = Avatar of Storm -> -900s cooldown, Hell's Core -> +8% critical extra damage")!;
    expect(legs.augments).toEqual(['Avatar of Storm -> -900s cooldown', "Hell's Core -> +8% critical extra damage"]);
    expect(legs.status).toBe('unavailable');
  });

  it('rejects non-equipment and items without an ID', () => {
    expect(item('| name = Exercise Sword\n| itemid = 28552\n| primarytype = Exercise Weapons')).toBeNull();
    expect(item('| name = Mystery Helmet\n| primarytype = Helmets')).toBeNull();
  });
});

describe('toImbuement', () => {
  const imbuement = (fields: string, title = 'Powerful Strike') =>
    toImbuement(parseInfobox(`{{Infobox Imbuement|List={{{1|}}}\n${fields}\n}}`, 'Infobox Imbuement')!, { title, rev: 1 });

  it('maps each effect parameter to its stat, in template order', () => {
    expect(imbuement('| prefix = Powerful\n| type = Strike\n| effect = {{Imbuement Effect/Strike|40%|5%}}\n| slots = swords, Bows')).toEqual({
      name: 'Powerful Strike', type: 'Strike', level: 'Powerful', effects: { critExtra: 40, critChance: 5 }, fits: ['swords', 'bows'], rev: 1,
    });
  });

  it('skips effects the app does not model', () => {
    expect(imbuement('| prefix = Basic\n| type = Featherweight\n| effect = {{Imbuement Effect/Featherweight|3%}}\n| slots = containers')).toBeNull();
  });
});
