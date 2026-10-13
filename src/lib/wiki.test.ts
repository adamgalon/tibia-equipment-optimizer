import { describe, expect, it } from 'vitest';
import { parseAttributes, parseDamage, parseInfobox, parseLoot, parseResist, parseSources, parseVocations, toCreature, toHunt, toImbuement, toItem } from './wiki.ts';

const page = (fields: string) => `{{Infobox Object|List={{{1|}}}|GetValue={{{GetValue|}}}\n${fields}\n}}\nSome article text.`;
const item = (fields: string, title = 'Test') => toItem(parseInfobox(page(fields))!, { title, rev: 1 });

describe('parseInfobox', () => {
  it('reads fields, strips links and ignores empty values', () => {
    const f = parseInfobox(page('| name = Falcon Plate\n| droppedby = {{Dropped By|Grand Master Oberon}}\n| notes = See [[Falcon Set|the set]].\n| bestloot ='))!;
    expect(f.name).toBe('Falcon Plate');
    expect(f.notes).toBe('See the set.');
    expect(f).not.toHaveProperty('bestloot');
  });

  it('reads past nested templates that close on their own line, and keeps link pipes inside values', () => {
    const f = parseInfobox('{{Infobox Creature|List={{{1|}}}\n| hp = 100\n| loot = {{Loot Table\n |{{Loot Item|Gold Coin}}\n}}\n| exp = 50\n| notes = [[Rat|rats]] nearby\n}}', 'Infobox Creature')!;
    expect(f.hp).toBe('100');
    expect(f.exp).toBe('50');
    expect(f.notes).toBe('rats nearby');
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

  it('keeps charges and wear-out durations, ignoring placeholders', () => {
    expect(item('| name = Stone Skin Amulet\n| itemid = 3081\n| primarytype = Amulets and Necklaces\n| charges = 5')).toMatchObject({ charges: 5 });
    expect(item('| name = Prismatic Ring\n| itemid = 16114\n| primarytype = Rings\n| duration = 60 minutes')).toMatchObject({ duration: '60 minutes' });
    expect(item('| name = Ring\n| itemid = 1\n| primarytype = Rings\n| duration = --\n| charges = ?')).not.toHaveProperty('duration');
  });

  it('rejects non-equipment and items without an ID', () => {
    expect(item('| name = Exercise Sword\n| itemid = 28552\n| primarytype = Exercise Weapons')).toBeNull();
    expect(item('| name = Mystery Helmet\n| primarytype = Helmets')).toBeNull();
  });
});

describe('creatures', () => {
  it('reads the max damage breakdown, ignoring summons and unknown values', () => {
    expect(parseDamage('{{Max Damage|physical=500|fire=250|lifedrain=480|manadrain=120|summons=250|holy=?}}', '{{Melee|0-900}}'))
      .toEqual({ physical: 500, fire: 250, lifedrain: 480, manadrain: 120 });
  });

  it('falls back to the strongest ability per element, with positional or named elements', () => {
    const abilities = '{{Ability List |{{Melee|0-230}} |{{Ability|Great Fireball|100-200|element=fire}} |{{Ability|Fire Wave|150-230|Fire |scene={{Scene|spell=x}} }}'
      + ' |{{Ability|Poison Ball|700+|poison}} |{{Ability|Paralyze|element=|condition=slowed}} |{{Ability|Fire Field|element=fire field}} }}';
    expect(parseDamage('1500+', abilities)).toEqual({ physical: 230, fire: 230, earth: 700 });
  });

  it('keeps hit points, experience, boss flag and only the unusual damage modifiers', () => {
    const fields = { hp: '8200', exp: '6000', isboss: 'no', physicalDmgMod: '75%', fireDmgMod: '0%', holyDmgMod: '112%', iceDmgMod: '100%', maxdmg: '{{Max Damage|fire=250}}' };
    expect(toCreature(fields, { title: 'Demon', rev: 7 })).toEqual({ name: 'Demon', hp: 8200, exp: 6000, damage: { fire: 250 }, takes: { physical: 75, fire: 0, holy: 112 }, rev: 7 });
    expect(toCreature({ ...fields, isboss: 'yes' }, { title: 'Boss', rev: 1 })?.boss).toBe(true);
    expect(toCreature({ ...fields, status: 'deprecated' }, { title: 'Old', rev: 1 })).toBeNull();
  });

  it('keeps bosses with unknown hit points when they list damage, and drops pages with nothing to show', () => {
    expect(toCreature({ hp: '?', isboss: 'yes', maxdmg: '{{Max Damage|death=2000}}' }, { title: 'Boss', rev: 1 }))
      .toEqual({ name: 'Boss', damage: { death: 2000 }, takes: {}, boss: true, rev: 1 });
    expect(toCreature({ hp: '?', exp: '0' }, { title: 'Pillar', rev: 1 })).toBeNull();
  });
});

describe('loot and hunting places', () => {
  it('reads the newest loot block as average amounts per kill', () => {
    const page = '__NOWYSIWYG__\n{{Loot2\n|version=14.12\n|kills=200\n|name=Demon\n|Gold Coin, times:200, amount:1-100, total:10000\n|Demon Horn, times:50, amount:1, total:50\n}}\n{{Loot2\n|kills=5\n|name=Demon\n|Old Item, times:1, total:1\n}}';
    expect(parseLoot(page)).toEqual({ name: 'Demon', kills: 200, drops: [['Gold Coin', 50], ['Demon Horn', 0.25]] });
    expect(parseLoot('{{Loot2\n|kills=0\n}}')).toBeNull();
  });

  it('reads ratings, levels and every creature list of a hunting place', () => {
    const page = '{{Infobox Hunt\n| city = Rookgaard\n| lvlknights = 6\n| lvlpaladins = \n| expstar = 1\n| lootstar = 2\n}}\n== Creatures ==\n{{CreatureList|type=List/Sorted\n |Wolf\n |[[Orc]]\n}}\n{{CreatureList\n |Orc\n |Minotaur\n}}';
    expect(toHunt(parseInfobox(page, 'Infobox Hunt')!, page, { title: 'Minotaur Hell', rev: 3 })).toEqual({
      name: 'Minotaur Hell', city: 'Rookgaard', exp: 1, loot: 2, level: { knight: 6 }, creatures: ['Wolf', 'Orc', 'Minotaur'], rev: 3,
    });
    const worded = '{{Infobox Hunt\n| exp = Very Good\n| loot = average\n}}';
    expect(toHunt(parseInfobox(worded, 'Infobox Hunt')!, worded, { title: 'X', rev: 1 })).toMatchObject({ exp: 5, loot: 3 });
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

  it('reads imbuing materials', () => {
    expect(parseSources('Green Dragon Leather: 20, Blazing Bone: 10, Draken Sulphur: 5')).toEqual([['Green Dragon Leather', 20], ['Blazing Bone', 10], ['Draken Sulphur', 5]]);
    expect(parseSources(undefined)).toEqual([]);
  });

  it('skips effects the app does not model', () => {
    expect(imbuement('| prefix = Basic\n| type = Featherweight\n| effect = {{Imbuement Effect/Featherweight|3%}}\n| slots = containers')).toBeNull();
  });
});
