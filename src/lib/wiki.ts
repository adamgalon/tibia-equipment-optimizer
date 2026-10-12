import { VOCATIONS } from './types.ts';
import type { Element, Item, ItemStatus, Skill, Slot, Vocation } from './types.ts';

/** Wiki item type -> equipment slot. Types not listed (exercise weapons, quest items, ...) are not equipment. */
const SLOT_BY_TYPE: Record<string, Slot> = {
  Helmets: 'head',
  'Amulets and Necklaces': 'neck',
  Armors: 'body',
  Legs: 'legs',
  Boots: 'feet',
  Rings: 'ring',
  'Axe Weapons': 'weapon',
  'Club Weapons': 'weapon',
  'Sword Weapons': 'weapon',
  'Distance Weapons': 'weapon',
  'Fist Fighting Weapons': 'weapon',
  Wands: 'weapon',
  Rods: 'weapon',
  Shields: 'shield',
  Spellbooks: 'shield',
  Quivers: 'shield',
  Ammunition: 'ammo',
  'Extra Slot': 'extra',
};

const RESIST_NAMES: Record<string, Element> = {
  physical: 'physical', fire: 'fire', earth: 'earth', energy: 'energy', ice: 'ice',
  holy: 'holy', death: 'death', 'life drain': 'lifedrain', 'mana drain': 'manadrain', drowning: 'drowning',
};

const ELEMENT_ATTACK_FIELDS: Record<string, Element> = {
  fire_attack: 'fire', earth_attack: 'earth', ice_attack: 'ice', energy_attack: 'energy', death_attack: 'death',
};

/** Reads the top-level `| key = value` parameters of the first `{{Infobox Object ...}}` in a page. */
export function parseInfobox(wikitext: string): Record<string, string> | null {
  const match = /\{\{Infobox Object(.*?)\n\}\}/s.exec(wikitext);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const part of match[1].split('\n|')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).replace(/^\|/, '').trim();
    const value = cleanMarkup(part.slice(eq + 1));
    if (key && value) fields[key] = value;
  }
  return fields;
}

/** Drops wiki links, HTML tags and comments, keeping the visible text. */
function cleanMarkup(value: string): string {
  return value
    .replace(/<!--.*?-->/gs, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First number in a value such as "+3", "10%", "85 (75-95)"; undefined for "?" or "--". */
export function num(value: string | undefined): number | undefined {
  const match = value?.match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function parseVocations(value: string | undefined): Vocation[] {
  const text = (value ?? '').toLowerCase();
  return VOCATIONS.filter((v) => text.includes(v));
}

/** "physical +12%, fire -5%" -> { physical: 12, fire: -5 } */
export function parseResist(value: string | undefined): Partial<Record<Element, number>> {
  const resist: Partial<Record<Element, number>> = {};
  for (const token of splitList(value)) {
    const match = /^([a-z ]+?)\s*([+-]?\d+(?:\.\d+)?)\s*%?$/i.exec(token);
    const element = match && RESIST_NAMES[match[1].toLowerCase()];
    if (element) resist[element] = Number(match[2]);
  }
  return resist;
}

/** Splits `attrib` into modelled bonuses; anything unrecognised is kept as text in `other`. */
export function parseAttributes(value: string | undefined) {
  const skills: Partial<Record<Skill, number>> = {};
  const other: string[] = [];
  let speed: number | undefined;
  let damageReflection: number | undefined;
  let lifeLeech: number | undefined;
  for (const token of splitList(value)) {
    let m: RegExpExecArray | null;
    if ((m = /^(sword|axe|club|distance|fist) fighting ([+-]?\d+)$/i.exec(token))) {
      skills[m[1].toLowerCase() as Skill] = Number(m[2]);
    } else if ((m = /^(fire|earth|energy|ice|holy|death|healing) magic level ([+-]?\d+)$/i.exec(token))) {
      skills[`${m[1].toLowerCase()}Magic` as Skill] = Number(m[2]);
    } else if ((m = /^magic level ([+-]?\d+)$/i.exec(token))) {
      skills.magic = Number(m[1]);
    } else if ((m = /^shielding ([+-]?\d+)$/i.exec(token))) {
      skills.shielding = Number(m[1]);
    } else if ((m = /^speed ([+-]?\d+)$/i.exec(token))) {
      speed = Number(m[1]);
    } else if ((m = /^(\d+) damage reflection$/i.exec(token))) {
      damageReflection = Number(m[1]);
    } else if ((m = /^life leech ([+-]?\d+(?:\.\d+)?)%?$/i.exec(token))) {
      lifeLeech = Number(m[1]);
    } else {
      other.push(token);
    }
  }
  return { skills, other, speed, damageReflection, lifeLeech };
}

function splitList(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** "85 (75-95)" | "8-18" | "30" -> [min, max] */
function parseRange(value: string | undefined): [number, number] | undefined {
  const range = value?.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = num(value);
  return single === undefined ? undefined : [single, single];
}

/** Converts infobox fields into an Item, or null when the object is not wearable equipment. */
export function toItem(fields: Record<string, string>, page: { title: string; rev: number }): Item | null {
  const slot = SLOT_BY_TYPE[fields.primarytype];
  const id = num(fields.itemid);
  if (!slot || id === undefined) return null;

  const attrs = parseAttributes(fields.attrib);
  const item: Item = {
    id,
    name: fields.name ?? page.title,
    slot,
    type: fields.primarytype,
    level: num(fields.levelrequired) ?? 0,
    vocations: parseVocations(fields.vocrequired),
    skills: attrs.skills,
    resist: parseResist(fields.resist),
    wiki: page.title,
    rev: page.rev,
  };

  if (slot === 'weapon') item.hands = fields.hands === 'Two' || fields.slot === 'Both Hands' ? 2 : 1;
  item.armor = num(fields.armor);
  item.defense = num(fields.defense);
  item.defenseMod = num(fields.defensemod);
  item.attack = num(fields.attack);
  for (const [field, element] of Object.entries(ELEMENT_ATTACK_FIELDS)) {
    const value = num(fields[field]);
    if (value) item.elementAttack = { element, value };
  }
  const damage = parseRange(fields.damagerange);
  const damageType = RESIST_NAMES[fields.damagetype?.toLowerCase() ?? ''];
  if (damage && damageType) item.damage = { element: damageType, min: damage[0], max: damage[1] };
  item.atkMod = num(fields.atk_mod);
  item.hitMod = num(fields.hit_mod);
  item.range = num(fields.range);
  item.manaCost = num(fields.manacost);
  item.speed = attrs.speed;
  item.critChance = num(fields.crithit_ch);
  item.critExtra = num(fields.critextra_dmg);
  item.lifeLeech = num(fields.hpleech_am) ?? attrs.lifeLeech;
  item.manaLeech = num(fields.manaleech_am);
  item.damageReflection = attrs.damageReflection;
  item.imbueSlots = num(fields.imbueslots) || undefined;
  item.upgradeClass = num(fields.upgradeclass);
  item.mantra = num(fields.mantra);
  if (fields.augments) item.augments = fields.augments.split(/,\s*(?=[^,]*->)/).map((s) => s.trim());
  if (attrs.other.length) item.other = attrs.other;
  if (['unavailable', 'deprecated', 'TS-only'].includes(fields.status)) item.status = fields.status as ItemStatus;

  // Drop unset optional fields so the JSON stays small and diffs stay readable.
  for (const key of Object.keys(item) as (keyof Item)[]) if (item[key] === undefined) delete item[key];
  return item;
}
