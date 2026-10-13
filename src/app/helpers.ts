// Data, browser storage, market access and text helpers shared by the app's sections.
import data from '../../data/items.json';
import imbuementData from '../../data/imbuements.json';
import type { Lang } from '../i18n.ts';
import { ELEMENTS, SKILLS } from '../lib/types.ts';
import type { Element, Imbuement, ImbuementData, Item, ItemData, Vocation } from '../lib/types.ts';
import { formatValue } from '../lib/stats.ts';
import { ROW_BY_KEY } from '../lib/build.ts';
import type { StoredBuild } from '../lib/build.ts';
import type { Price } from '../lib/prices.ts';

export const { meta, items } = data as ItemData;
export const byId = new Map(items.map((i) => [i.id, i]));
export const IMBUEMENT_LEVELS = ['Basic', 'Intricate', 'Powerful'];
// Grouped by type, weakest first, as in the game's imbuing window. The importer writes this shape; TypeScript infers one type per entry.
export const imbuements = [...(imbuementData as unknown as ImbuementData).imbuements]
  .sort((a, b) => a.type.localeCompare(b.type) || IMBUEMENT_LEVELS.indexOf(a.level) - IMBUEMENT_LEVELS.indexOf(b.level));
export const imbuementByName = new Map(imbuements.map((i) => [i.name, i]));
export const MAX_COMPARE = 4;
export const PAGE = 150;
export type Sort = 'level' | 'name' | 'armor' | 'defense' | 'attack' | 'protection';
export type T = (key: string, vars?: Record<string, string | number>) => string;

// Language is a per-viewer convenience, so browser storage is enough (and may be unavailable).
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'pl') return saved;
  } catch { /* storage blocked */ }
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

// Builds live in this browser only; storage may be blocked or hold IDs from older item data.
export function readStored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
export interface SavedBuild { name: string; slots: StoredBuild }
// A shared build travels in the link as #build=<base64url of its stored JSON>; it is read once, before the hash is rewritten.
export const toBase64Url = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const shareCode = (stored: StoredBuild) => toBase64Url(JSON.stringify(stored));
export const sharedBuild: unknown = (() => {
  const code = location.hash.match(/build=([\w-]+)/)?.[1];
  if (!code) return null;
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
})();

export function initialSaved(): SavedBuild[] {
  const value = readStored('builds');
  const saved: SavedBuild[] = Array.isArray(value) ? value.filter((b) => typeof b?.name === 'string') : [];
  // Opening a shared link replaces the current build, so the one it replaces is kept here first.
  const current = readStored('build');
  if (sharedBuild && current && typeof current === 'object' && Object.keys(current).length && JSON.stringify(current) !== JSON.stringify(sharedBuild)) {
    saved.push({ name: `Before link ${new Date().toLocaleString()}`, slots: current as StoredBuild });
  }
  return saved;
}

export const MAX_HUNT = 12;
export const stars = (n: number) => '★'.repeat(Math.min(n, 5)) + '☆'.repeat(5 - Math.min(n, 5));
/** The hunt advisor's creatures by wiki page name; names the data no longer has are simply not shown. */
export function initialHunt(): string[] {
  const value = readStored('hunt');
  return Array.isArray(value) ? value.filter((name) => typeof name === 'string').slice(0, MAX_HUNT) : [];
}

export const MARKET_API = 'https://api.tibiamarket.top';
// The rate-limited API is asked at most hourly per world; world names are kept for a day.
export const MARKET_TTL = 60 * 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;

/** Tibia Market allows about one request per 5 seconds, so a 429 is retried once. */
export async function marketJson(path: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${MARKET_API}${path}`);
    // Retry-After is not readable cross-origin; its usual value is 5 s.
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 6000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

export const worldNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((w) => (typeof w?.name === 'string' ? [w.name] : [])).sort() : [];

export function cachedWorlds(): string[] {
  const cached = readStored('worlds') as { fetchedAt?: number; list?: unknown } | null;
  return cached && Date.now() - (cached.fetchedAt ?? 0) < DAY ? worldNames(cached.list) : [];
}

export function cachedMarket(world: string): Map<number, Price> | undefined {
  const cached = readStored('market') as { world?: string; fetchedAt?: number; prices?: unknown } | null;
  if (cached?.world !== world || Date.now() - (cached.fetchedAt ?? 0) >= MARKET_TTL || !Array.isArray(cached.prices)) return undefined;
  return new Map(cached.prices.filter((e): e is [number, Price] => typeof e?.[0] === 'number' && typeof e?.[1]?.gold === 'number'));
}

/** The player's own prices: world ("" when none is chosen) -> item ID -> gold. */
export type OwnPrices = Record<string, Record<string, number>>;
export function initialOwnPrices(): OwnPrices {
  const value = readStored('prices');
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as OwnPrices) : {};
}

// A comparison lives in the URL hash (#compare=id,id) so it can be shared as a link.
export function initialCompare(): number[] {
  const match = location.hash.match(/compare=([\d,]+)/);
  if (!match) return [];
  return match[1].split(',').map(Number).filter((id) => items.some((i) => i.id === id)).slice(0, MAX_COMPARE);
}

export const wikiUrl = (title: string) => `https://tibia.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
export const attackValue = (i: Item) => (i.damage ? (i.damage.min + i.damage.max) / 2 : (i.attack ?? 0) + (i.elementAttack?.value ?? 0));

export function sortValue(item: Item, sort: Sort, element: Element | ''): number {
  switch (sort) {
    case 'level': return item.level;
    case 'armor': return item.armor ?? 0;
    case 'defense': return item.defense ?? 0;
    case 'attack': return attackValue(item);
    case 'protection': return element ? (item.resist[element] ?? 0) : Object.values(item.resist).reduce((s, v) => s + (v ?? 0), 0);
    default: return 0;
  }
}

export function mainStats(item: Item, t: T): string {
  const parts: string[] = [];
  if (item.armor) parts.push(`${t('armor')} ${item.armor}`);
  if (item.attack) parts.push(`${t('attack')} ${item.attack}${item.elementAttack ? ` + ${item.elementAttack.value} ${t(`el.${item.elementAttack.element}`)}` : ''}`);
  if (item.damage) parts.push(`${item.damage.min}–${item.damage.max} ${t(`el.${item.damage.element}`)}`);
  if (item.atkMod) parts.push(`${t('atkMod')} ${signed(item.atkMod)}`);
  if (item.defense) parts.push(`${t('defense')} ${item.defense}${item.defenseMod ? ` ${signed(item.defenseMod)}` : ''}`);
  if (item.range) parts.push(`${t('range')} ${item.range}`);
  return parts.join(' · ');
}

export function protections(item: Item, t: T): string {
  return ELEMENTS.filter((e) => item.resist[e] !== undefined).map((e) => `${t(`el.${e}`)} ${signed(item.resist[e]!)}%`).join(', ');
}

export function bonuses(item: Item, t: T): string {
  const parts = SKILLS.filter((s) => item.skills[s]).map((s) => `${t(`skill.${s}`)} ${signed(item.skills[s]!)}`);
  if (item.speed) parts.push(`${t('speed')} ${signed(item.speed)}`);
  if (item.critChance) parts.push(`${t('critChance')} ${item.critChance}%`);
  if (item.critExtra) parts.push(`${t('critExtra')} ${item.critExtra}%`);
  if (item.lifeLeech) parts.push(`${t('lifeLeech')} ${item.lifeLeech}%`);
  if (item.manaLeech) parts.push(`${t('manaLeech')} ${item.manaLeech}%`);
  if (item.damageReflection) parts.push(`${t('damageReflection')} ${item.damageReflection}`);
  if (item.mantra) parts.push(`${t('mantra')} ${item.mantra}`);
  return [...parts, ...(item.other ?? [])].join(', ');
}

export const usable = (i: Item, vocation: Vocation | '', maxLevel: number, showUnavailable: boolean) =>
  (showUnavailable || !i.status) && (!vocation || !i.vocations.length || i.vocations.includes(vocation)) && i.level <= maxLevel;

export const effectText = (imbuement: Imbuement, t: T) =>
  Object.entries(imbuement.effects).map(([key, value]) => {
    const row = ROW_BY_KEY.get(key)!;
    return `${row.label(t)} +${formatValue(row, value)}`;
  }).join(', ');

/** "5 charges" or "60 minutes" for items that wear out, so a cheap price is not mistaken for a lasting upgrade. */
export const wearsOut = (item: Item, t: T) => (item.charges ? t('charges', { n: item.charges }) : item.duration);

export const vocationText = (item: Item, t: T) => (item.vocations.length ? item.vocations.map((v) => t(`voc.${v}`)).join(', ') : t('everyVocation'));
