import { ATTACK_ELEMENTS, VOCATIONS } from './types.ts';
import type { Creature, Element, Hunt, Imbuement, Item, ItemStatus, Proficiency, Skill, Slot, Vocation } from './types.ts';

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

/** Element names in creature abilities and {{Max Damage}} parameters; poison is earth damage. */
const DAMAGE_NAMES: Record<string, Element> = {
  ...RESIST_NAMES, poison: 'earth', lifedrain: 'lifedrain', manadrain: 'manadrain', drown: 'drowning',
};

const ELEMENT_ATTACK_FIELDS: Record<string, Element> = {
  fire_attack: 'fire', earth_attack: 'earth', ice_attack: 'ice', energy_attack: 'energy', death_attack: 'death',
};

/** Imbuement effect template -> the stat keys its parameters fill, in order (TibiaWiki "Template:Imbuement Effect/..."). */
const IMBUEMENT_EFFECTS: Record<string, string[]> = {
  'Dragon Hide': ['resist.fire'], 'Snake Skin': ['resist.earth'], 'Quara Scale': ['resist.ice'],
  'Cloud Fabric': ['resist.energy'], 'Demon Presence': ['resist.holy'], 'Lich Shroud': ['resist.death'],
  Scorch: ['convert.fire'], Venom: ['convert.earth'], Frost: ['convert.ice'], Electrify: ['convert.energy'], Reap: ['convert.death'],
  Bash: ['skill.club'], Chop: ['skill.axe'], Slash: ['skill.sword'], Precision: ['skill.distance'], Punch: ['skill.fist'],
  Blockade: ['skill.shielding'], Epiphany: ['skill.magic'], Swiftness: ['speed'],
  Strike: ['critExtra', 'critChance'],
  // The second parameter is the trigger chance, 100% at every level.
  Vampirism: ['lifeLeech'], Void: ['manaLeech'],
  Vibrancy: ['paralysisDeflection'],
};

/** Reads the top-level `| key = value` parameters of the first `{{<template> ...}}` in a page. */
export function parseInfobox(wikitext: string, template = 'Infobox Object'): Record<string, string> | null {
  const start = wikitext.indexOf(`{{${template}`);
  if (start < 0) return null;
  // Split on the infobox's own "|" and stop at its own "}}", skipping nested templates ({{Loot Table ...}}) and links ([[a|b]]).
  const parts: string[] = [];
  let depth = 0;
  let from = start + template.length + 2;
  for (let i = from; i < wikitext.length; i++) {
    const pair = wikitext.slice(i, i + 2);
    if (pair === '{{' || pair === '[[') {
      depth++;
      i++;
    } else if (depth > 0 && (pair === '}}' || pair === ']]')) {
      depth--;
      i++;
    } else if (depth === 0 && (pair === '}}' || wikitext[i] === '|')) {
      parts.push(wikitext.slice(from, i));
      from = i + 1;
      if (pair === '}}') break;
    }
  }
  const fields: Record<string, string> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
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
  item.charges = num(fields.charges) || undefined;
  if (/\d/.test(fields.duration ?? '')) item.duration = fields.duration;
  if (fields.augments) item.augments = fields.augments.split(/,\s*(?=[^,]*->)/).map((s) => s.trim());
  if (attrs.other.length) item.other = attrs.other;
  if (['unavailable', 'deprecated', 'TS-only'].includes(fields.status)) item.status = fields.status as ItemStatus;

  // Drop unset optional fields so the JSON stays small and diffs stay readable.
  for (const key of Object.keys(item) as (keyof Item)[]) if (item[key] === undefined) delete item[key];
  return item;
}

/** Highest number in "150-250", "700+" or "0-500"; undefined for "?". */
function maxNumber(value: string | undefined): number | undefined {
  const numbers = value?.match(/\d+/g);
  return numbers ? Math.max(...numbers.map(Number)) : undefined;
}

/** Highest damage per element: the {{Max Damage|fire=440|...}} breakdown, else the strongest listed ability of each element. */
export function parseDamage(maxdmg: string | undefined, abilities: string | undefined): Partial<Record<Element, number>> {
  const damage: Partial<Record<Element, number>> = {};
  const add = (name: string | undefined, value: number | undefined) => {
    const element = DAMAGE_NAMES[name?.trim().toLowerCase() ?? ''];
    if (element && value) damage[element] = Math.max(damage[element] ?? 0, value);
  };
  for (const param of /\{\{Max Damage\|([^}]*)\}\}/.exec(maxdmg ?? '')?.[1].split('|') ?? []) {
    const [name, value] = param.split('=');
    add(name, maxNumber(value));
  }
  if (Object.keys(damage).length) return damage;
  // {{Melee|0-500}}, {{Ability|Great Fireball|150-250|fire}} or {{Ability|Fire Wave|150-230|element=fire}}
  for (const [, kind, body] of (abilities ?? '').matchAll(/\{\{(Melee|Ability)\|([^{}]*)/g)) {
    const params = body.split('|');
    const named = params.find((p) => /^\s*element\s*=/.test(p))?.split('=')[1];
    const positional = params.filter((p) => !p.includes('='));
    if (kind === 'Melee') add(named || 'physical', maxNumber(positional[0]));
    else add(named || positional[2], maxNumber(positional[1]));
  }
  return damage;
}

/**
 * Converts Infobox Creature fields into a Creature, or null for removed creatures and for pages with nothing to show
 * (no hit points, damage or experience, such as pillars). Many bosses list "?" hit points but do list their damage.
 */
export function toCreature(fields: Record<string, string>, page: { title: string; rev: number }): Creature | null {
  if (['deprecated', 'unavailable', 'TS-only'].includes(fields.status)) return null;
  const creature: Creature = { name: page.title, hp: num(fields.hp), exp: num(fields.exp), damage: parseDamage(fields.maxdmg, fields.abilities), takes: {}, rev: page.rev };
  if (creature.hp === undefined && !creature.exp && !Object.keys(creature.damage).length) return null;
  for (const element of ATTACK_ELEMENTS) {
    const value = num(fields[`${element}DmgMod`]);
    if (value !== undefined && value !== 100) creature.takes[element] = value;
  }
  if (fields.isboss === 'yes') creature.boss = true;
  // Drop unset optional fields so the JSON stays small and diffs stay readable.
  if (creature.hp === undefined) delete creature.hp;
  if (creature.exp === undefined) delete creature.exp;
  return creature;
}

/**
 * The first {{Loot2}} block of a "Loot Statistics:" page (the newest game version comes first):
 * kills counted, and per item name the average amount dropped per kill ("|Gold Coin, times:..., total:898175").
 */
export function parseLoot(wikitext: string): { name?: string; kills: number; drops: [string, number][] } | null {
  const block = /\{\{Loot2([^{}]*)\}\}/.exec(wikitext)?.[1];
  const kills = num(/\|\s*kills\s*=([^|\n]*)/.exec(block ?? '')?.[1]);
  if (!block || !kills) return null;
  const drops: [string, number][] = [...block.matchAll(/\|([^|=\n]+?),\s*times:[^|\n]*?total:\s*(\d+)/g)]
    .map(([, item, total]) => [item.trim(), Number((Number(total) / kills).toPrecision(4))]);
  return { name: /\|\s*name\s*=([^|\n]*)/.exec(block)?.[1].trim(), kills, drops };
}

/** Converts an Infobox Hunt page into a Hunt; its creatures come from the page's {{CreatureList}} blocks. */
export function toHunt(fields: Record<string, string>, wikitext: string, page: { title: string; rev: number }): Hunt {
  const creatures = [...wikitext.matchAll(/\{\{CreatureList([^{}]*)\}\}/g)]
    .flatMap(([, body]) => body.split('|').map((p) => cleanMarkup(p)).filter((p) => p && !p.includes('=')));
  const level: Hunt['level'] = {};
  for (const [field, group] of [['lvlknights', 'knight'], ['lvlpaladins', 'paladin'], ['lvlmages', 'mage']] as const) {
    const value = num(fields[field]);
    if (value) level[group] = value;
  }
  // Pages rate with stars or words; Template:Infobox Hunt maps the words to the same 1-5 scale.
  const rating = (stars: string | undefined, word: string | undefined) =>
    num(stars) ?? ({ 'very bad': 1, bad: 2, average: 3, good: 4, 'very good': 5 } as Record<string, number>)[word?.toLowerCase() ?? ''];
  const hunt: Hunt = {
    name: page.title, city: fields.city, exp: rating(fields.expstar, fields.exp), loot: rating(fields.lootstar, fields.loot),
    level, creatures: [...new Set(creatures)], rev: page.rev,
  };
  for (const key of ['city', 'exp', 'loot'] as const) if (hunt[key] === undefined) delete hunt[key];
  return hunt;
}

/**
 * Weapon proficiency from the "Weapon Proficiency Tables" page (===Group=== sections with |perk_1 = ... |perk_7 =,
 * each perk a {{Weapon Proficiency Button |...|text=...}}) and the item -> group switch in Template:Weapon Proficiency Name.
 */
export function parseProficiency(tables: string, names: string): Proficiency[] {
  const items = new Map<string, string[]>();
  for (const [, item, group] of names.matchAll(/^\|\s*([^=\n|]+?)\s*=\s*([^\n|]+?)\s*$/gm)) items.set(group, [...(items.get(group) ?? []), item]);
  return [...tables.matchAll(/===([^=\n]+)===\s*\n([\s\S]*?)(?====|<\/includeonly>|$)/g)].flatMap(([, title, body]) => {
    const name = title.trim();
    const levels = body.split(/\|\s*perk_\d+\s*=/).slice(1).map((level) => [...level.matchAll(/text=([^}]*)\}\}/g)].map((m) => cleanMarkup(m[1])));
    return levels.length && items.has(name) ? [{ name, items: items.get(name)!, levels }] : [];
  });
}

/** "Green Dragon Leather: 20, Blazing Bone: 10" -> [["Green Dragon Leather", 20], ["Blazing Bone", 10]] */
export function parseSources(text: string | undefined): [string, number][] {
  return splitList(text).flatMap((part) => {
    const m = /^(.+?)\s*:\s*(\d+)$/.exec(part);
    return m ? [[m[1].trim(), Number(m[2])] as [string, number]] : [];
  });
}

/** Converts Infobox Imbuement fields into an Imbuement, or null for effects the app does not model (e.g. capacity). */
export function toImbuement(fields: Record<string, string>, page: { title: string; rev: number }): Imbuement | null {
  const effect = /\{\{Imbuement Effect\/([^|}]+)\|([^}]*)\}\}/.exec(fields.effect ?? '');
  const keys = effect && IMBUEMENT_EFFECTS[effect[1]];
  const level = fields.prefix as Imbuement['level'];
  if (!keys || !fields.type || !['Basic', 'Intricate', 'Powerful'].includes(level)) return null;
  const params = effect[2].split('|');
  const effects: Record<string, number> = {};
  keys.forEach((key, i) => {
    const value = num(params[i]);
    if (value !== undefined) effects[key] = value;
  });
  return { name: page.title, type: fields.type, level, effects, fits: splitList(fields.slots).map((s) => s.toLowerCase()), rev: page.rev };
}
