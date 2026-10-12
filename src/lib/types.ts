export const VOCATIONS = ['knight', 'paladin', 'sorcerer', 'druid', 'monk'] as const;
export type Vocation = (typeof VOCATIONS)[number];

export const ELEMENTS = ['physical', 'fire', 'earth', 'energy', 'ice', 'holy', 'death', 'lifedrain', 'manadrain', 'drowning'] as const;
export type Element = (typeof ELEMENTS)[number];

export const SKILLS = [
  'magic', 'sword', 'axe', 'club', 'distance', 'fist', 'shielding',
  'fireMagic', 'earthMagic', 'energyMagic', 'iceMagic', 'holyMagic', 'deathMagic', 'healingMagic',
] as const;
export type Skill = (typeof SKILLS)[number];

export const SLOTS = ['head', 'neck', 'body', 'legs', 'feet', 'ring', 'weapon', 'shield', 'ammo', 'extra'] as const;
export type Slot = (typeof SLOTS)[number];

export type ItemStatus = 'unavailable' | 'deprecated' | 'TS-only';

export interface Item {
  /** Client item ID; the same ID the market data uses. */
  id: number;
  name: string;
  slot: Slot;
  /** Wiki item type, e.g. "Armors", "Wands", "Fist Fighting Weapons". */
  type: string;
  level: number;
  /** Empty means every vocation can use it. */
  vocations: Vocation[];
  hands?: 1 | 2;
  armor?: number;
  defense?: number;
  defenseMod?: number;
  attack?: number;
  elementAttack?: { element: Element; value: number };
  /** Wands and rods. */
  damage?: { element: Element; min: number; max: number };
  atkMod?: number;
  hitMod?: number;
  range?: number;
  manaCost?: number;
  skills: Partial<Record<Skill, number>>;
  resist: Partial<Record<Element, number>>;
  speed?: number;
  critChance?: number;
  critExtra?: number;
  lifeLeech?: number;
  manaLeech?: number;
  damageReflection?: number;
  imbueSlots?: number;
  /** Forge classification 1-4; caps the forge tier at 1, 2, 3 or 10. */
  upgradeClass?: number;
  mantra?: number;
  augments?: string[];
  /** Attribute text the importer does not model yet. */
  other?: string[];
  status?: ItemStatus;
  /** Wiki page title and the revision the values came from. */
  wiki: string;
  rev: number;
}

export interface DataMeta { source: string; sourceUrl: string; license: string; licenseUrl: string; fetchedAt: string; count: number }

export interface ItemData {
  meta: DataMeta;
  items: Item[];
}

export interface Imbuement {
  /** Page title such as "Powerful Dragon Hide"; also the key in saved builds. */
  name: string;
  /** "Dragon Hide": an item holds at most one imbuement of a type. */
  type: string;
  level: 'Basic' | 'Intricate' | 'Powerful';
  /** Stat row key -> value, e.g. { 'resist.fire': 15 } or { critExtra: 40, critChance: 5 }. */
  effects: Record<string, number>;
  /** Item kinds as the wiki names them: "armors", "swords", "helmets (sorcerer)", ... */
  fits: string[];
  rev: number;
}

export interface ImbuementData {
  meta: DataMeta;
  imbuements: Imbuement[];
}
